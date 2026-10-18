// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Заглушки биржи для проверки кривой: WETH и пара в духе Uniswap V2,
// ровно настолько, насколько их трогает выход на биржу.

contract MockWETH {
    mapping(address => uint256) public balanceOf;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "weth balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }
}

interface IBal {
    function balanceOf(address) external view returns (uint256);
}

contract MockPair {
    address public token0;
    address public token1;
    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public totalSupply;
    address public lpHolder;

    constructor(address a, address b) {
        token0 = a;
        token1 = b;
    }

    // Как у Uniswap V2: что пришло сверх резервов — то и вклад.
    function mint(address to) external returns (uint256 liquidity) {
        uint256 b0 = IBal(token0).balanceOf(address(this));
        uint256 b1 = IBal(token1).balanceOf(address(this));
        uint256 a0 = b0 - reserve0;
        uint256 a1 = b1 - reserve1;
        require(a0 > 0 && a1 > 0, "INSUFFICIENT_LIQUIDITY_MINTED");
        liquidity = 1;
        totalSupply += liquidity;
        lpHolder = to;
        reserve0 = b0;
        reserve1 = b1;
    }

    // Подкладка монеты в пул до запуска: так атакуют выход на биржу.
    function sync() external {
        reserve0 = IBal(token0).balanceOf(address(this));
        reserve1 = IBal(token1).balanceOf(address(this));
    }
}

contract MockDexFactory {
    mapping(address => mapping(address => address)) public getPair;

    function createPair(address a, address b) external returns (address pair) {
        require(getPair[a][b] == address(0), "exists");
        pair = address(new MockPair(a, b));
        getPair[a][b] = pair;
        getPair[b][a] = pair;
    }
}
