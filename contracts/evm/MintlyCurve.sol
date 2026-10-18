// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/*
 * Запуск мемкоинов Mintly в сетях EVM (BNB Chain, Base, Ethereum).
 *
 * Та же модель, что у кривой в TON и Solana: весь выпуск лежит на
 * фабрике, цена идёт по произведению виртуальных запасов, а когда с
 * кривой продано всё, что на ней продаётся, собранная монета и остаток
 * токенов уходят в пул обычной биржи сети (PancakeSwap V2 или
 * Uniswap V2), а доли пула сжигаются — вытащить ликвидность нельзя.
 *
 * Почему токен до выхода на биржу не переводится никуда, кроме фабрики.
 * Пул на бирже может создать кто угодно и раньше нас. Если бы токены
 * свободно ходили, можно было бы завести пул по своей цене и сорвать
 * выход на биржу. Пока кривая не закрыта, токен двигается только между
 * человеком и фабрикой: купить, продать — и всё.
 *
 * Почему пул пополняется напрямую, а не через роутер. Роутер отказывает,
 * если в пуле уже лежит монета без токенов (её туда может прислать кто
 * угодно), и выход на биржу вставал бы навсегда. Перевод в пул и mint
 * такой подкладке не мешают: присланное просто остаётся в пуле.
 *
 * Токены — минимальные копии одного образца (EIP-1167): развернуть
 * полный ERC-20 на каждый запуск в Ethereum стоило бы десятки долларов.
 */

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
}

interface IDexFactory {
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}

interface IDexPair {
    function mint(address to) external returns (uint256);
}

contract MintlyToken {
    string public name;
    string public symbol;
    string public uri;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public factory;
    // Пока ложь — переводы только с фабрики и на фабрику (см. выше).
    bool public listed;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // Образец сам по себе не используется: инициализировать его нельзя.
    constructor() {
        factory = address(1);
    }

    function initialize(string calldata n, string calldata s, string calldata u, uint256 supply) external {
        require(factory == address(0), "inited");
        factory = msg.sender;
        name = n;
        symbol = s;
        uri = u;
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }

    function list() external {
        require(msg.sender == factory, "factory");
        listed = true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        // Фабрике разрешения не нужно: продажу на кривой она забирает
        // сама, и человеку не приходится платить газ за отдельный approve.
        if (msg.sender != factory) {
            uint256 a = allowance[from][msg.sender];
            if (a != type(uint256).max) {
                require(a >= value, "allowance");
                allowance[from][msg.sender] = a - value;
            }
        }
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) internal {
        if (!listed) require(from == factory || to == factory, "not listed");
        require(to != address(0), "zero");
        uint256 b = balanceOf[from];
        require(b >= value, "balance");
        unchecked {
            balanceOf[from] = b - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}

contract MintlyCurve {
    struct Curve {
        address creator;
        uint128 realNative;   // сколько монеты сети собрано на кривой
        uint128 sold;         // сколько токенов продано с кривой
        bool graduated;
    }

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant CURVE_SUPPLY = 800_000_000e18;  // продаётся с кривой
    uint256 public constant LP_SUPPLY = 200_000_000e18;     // уходит в пул биржи
    uint256 public constant VIRTUAL_TOKENS = 1_073_000_000e18;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address public immutable tokenImpl;
    address public immutable weth;
    address public immutable dexFactory;
    // Виртуальный запас монеты сети: задаёт стартовую цену. У каждой сети
    // свой, потому что BNB и ETH стоят по-разному.
    uint256 public immutable virtualNative;

    address public owner;
    address public feeRecipient;
    uint16 public feeBps;          // комиссия сделки, не больше 2%
    uint256 public launchFee;      // плата за запуск в монете сети

    mapping(address => Curve) public curves;
    address[] public allTokens;

    uint256 private locked = 1;

    event Created(address indexed token, address indexed creator, string name, string symbol, string uri);
    event Trade(address indexed token, address indexed trader, bool isBuy, uint256 nativeAmount, uint256 tokenAmount, uint256 realNative, uint256 sold);
    event Graduated(address indexed token, address pair, uint256 nativeAmount, uint256 tokenAmount);

    modifier nonReentrant() {
        require(locked == 1, "reentrancy");
        locked = 2;
        _;
        locked = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    constructor(address _weth, address _dexFactory, uint256 _virtualNative, address _feeRecipient, uint16 _feeBps) {
        require(_feeBps <= 200, "fee");
        require(_virtualNative > 0, "virtual");
        tokenImpl = address(new MintlyToken());
        weth = _weth;
        dexFactory = _dexFactory;
        virtualNative = _virtualNative;
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    // --- Настройки площадки ------------------------------------------

    function setFees(address recipient, uint16 bps, uint256 _launchFee) external onlyOwner {
        require(bps <= 200, "fee");
        require(recipient != address(0), "zero");
        feeRecipient = recipient;
        feeBps = bps;
        launchFee = _launchFee;
    }

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "zero");
        owner = next;
    }

    // --- Чтение ------------------------------------------------------

    function tokensCount() external view returns (uint256) {
        return allTokens.length;
    }

    // Цена одного целого токена в wei монеты сети.
    function price(address token) external view returns (uint256) {
        Curve storage c = curves[token];
        require(c.creator != address(0), "unknown");
        uint256 x = virtualNative + c.realNative;
        uint256 y = VIRTUAL_TOKENS - c.sold;
        return (x * 1e18) / y;
    }

    // Сколько токенов придёт за amountIn монеты (до комиссии) и сколько
    // монеты на самом деле уйдёт — у последней покупки остаток вернётся.
    function quoteBuy(address token, uint256 amountIn) public view returns (uint256 tokensOut, uint256 spent) {
        Curve storage c = curves[token];
        require(c.creator != address(0) && !c.graduated, "closed");
        uint256 fee = (amountIn * feeBps) / 10_000;
        uint256 net;
        (tokensOut, net) = _buyMath(c, amountIn - fee);
        spent = net + fee;
        if (net < amountIn - fee) spent = net + (net * feeBps) / (10_000 - feeBps);
    }

    function quoteSell(address token, uint256 tokensIn) public view returns (uint256 nativeOut) {
        Curve storage c = curves[token];
        require(c.creator != address(0) && !c.graduated, "closed");
        uint256 gross = _sellMath(c, tokensIn);
        nativeOut = gross - (gross * feeBps) / 10_000;
    }

    // --- Запуск и сделки -----------------------------------------------

    function create(string calldata n, string calldata s, string calldata u, uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (address token)
    {
        require(bytes(n).length > 0 && bytes(n).length <= 64, "name");
        require(bytes(s).length > 0 && bytes(s).length <= 16, "symbol");
        require(bytes(u).length <= 300, "uri");
        require(msg.value >= launchFee, "launch fee");

        token = _clone(tokenImpl);
        MintlyToken(token).initialize(n, s, u, TOTAL_SUPPLY);
        curves[token] = Curve({ creator: msg.sender, realNative: 0, sold: 0, graduated: false });
        allTokens.push(token);
        emit Created(token, msg.sender, n, s, u);

        if (launchFee > 0) _pay(feeRecipient, launchFee);
        uint256 rest = msg.value - launchFee;
        if (rest > 0) _buy(token, msg.sender, rest, minTokensOut);
    }

    function buy(address token, uint256 minTokensOut) external payable nonReentrant {
        require(msg.value > 0, "zero");
        _buy(token, msg.sender, msg.value, minTokensOut);
    }

    function sell(address token, uint256 tokensIn, uint256 minNativeOut) external nonReentrant {
        Curve storage c = curves[token];
        require(c.creator != address(0) && !c.graduated, "closed");
        require(tokensIn > 0, "zero");
        uint256 gross = _sellMath(c, tokensIn);
        uint256 fee = (gross * feeBps) / 10_000;
        uint256 out = gross - fee;
        require(out >= minNativeOut, "slippage");

        c.realNative -= uint128(gross);
        c.sold -= uint128(tokensIn);
        MintlyToken(token).transferFrom(msg.sender, address(this), tokensIn);
        if (fee > 0) _pay(feeRecipient, fee);
        _pay(msg.sender, out);
        emit Trade(token, msg.sender, false, out, tokensIn, c.realNative, c.sold);
    }

    // --- Внутреннее ----------------------------------------------------

    function _buy(address token, address buyer, uint256 amountIn, uint256 minTokensOut) internal {
        Curve storage c = curves[token];
        require(c.creator != address(0) && !c.graduated, "closed");
        uint256 fee = (amountIn * feeBps) / 10_000;
        (uint256 out, uint256 net) = _buyMath(c, amountIn - fee);
        require(out > 0 && out >= minTokensOut, "slippage");
        // Последняя покупка упирается в конец кривой: берём только нужную
        // часть, комиссию пересчитываем от неё же, остаток возвращаем.
        if (net + fee < amountIn) {
            fee = (net * feeBps) / (10_000 - feeBps);
        }
        uint256 refund = amountIn - net - fee;

        c.realNative += uint128(net);
        c.sold += uint128(out);
        MintlyToken(token).transfer(buyer, out);
        if (fee > 0) _pay(feeRecipient, fee);
        if (refund > 0) _pay(buyer, refund);
        emit Trade(token, buyer, true, net + fee, out, c.realNative, c.sold);

        if (c.sold >= CURVE_SUPPLY) _graduate(token, c);
    }

    // Произведение виртуальных запасов: x·y = virtualNative·VIRTUAL_TOKENS.
    function _buyMath(Curve storage c, uint256 netIn) internal view returns (uint256 out, uint256 used) {
        uint256 x = virtualNative + c.realNative;
        uint256 y = VIRTUAL_TOKENS - c.sold;
        uint256 k = virtualNative * VIRTUAL_TOKENS;
        out = y - _ceilDiv(k, x + netIn);
        used = netIn;
        uint256 left = CURVE_SUPPLY - c.sold;
        if (out >= left) {
            out = left;
            // Сколько монеты нужно ровно на остаток, с округлением вверх —
            // кривая не должна отдать токены дешевле своей формулы.
            used = _ceilDiv(k, y - left) - x;
            if (used > netIn) used = netIn;
        }
    }

    function _sellMath(Curve storage c, uint256 tokensIn) internal view returns (uint256) {
        require(tokensIn <= c.sold, "too much");
        uint256 x = virtualNative + c.realNative;
        uint256 y = VIRTUAL_TOKENS - c.sold;
        uint256 k = virtualNative * VIRTUAL_TOKENS;
        uint256 gross = x - _ceilDiv(k, y + tokensIn);
        // Округления не дают отдать больше, чем собрано.
        if (gross > c.realNative) gross = c.realNative;
        return gross;
    }

    function _graduate(address token, Curve storage c) internal {
        c.graduated = true;
        uint256 nativeAmount = c.realNative;
        address pair = IDexFactory(dexFactory).getPair(token, weth);
        if (pair == address(0)) pair = IDexFactory(dexFactory).createPair(token, weth);

        // Сначала токены в пул (фабрике это разрешено и до выхода на
        // биржу), потом открываем переводы, потом монету и mint.
        MintlyToken(token).transfer(pair, LP_SUPPLY);
        MintlyToken(token).list();
        IWETH(weth).deposit{ value: nativeAmount }();
        require(IWETH(weth).transfer(pair, nativeAmount), "weth");
        IDexPair(pair).mint(DEAD);
        emit Graduated(token, pair, nativeAmount, LP_SUPPLY);
    }

    function _pay(address to, uint256 value) internal {
        (bool ok, ) = payable(to).call{ value: value }("");
        require(ok, "pay");
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    // EIP-1167: минимальная копия образца токена.
    function _clone(address impl) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        require(instance != address(0), "clone");
    }
}
