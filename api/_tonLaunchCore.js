// Собрано из src/tonLaunchCore.js скриптом scripts/build-ton-core.mjs — не править руками.

// src/tonLaunchCore.js
import { Address as Address4, beginCell as beginCell4, toNano as toNano2 } from "@ton/core";
import { JettonMinter } from "@ton-community/assets-sdk/dist/jetton/JettonMinter.js";
import { JettonWallet } from "@ton-community/assets-sdk/dist/jetton/JettonWallet.js";

// src/curveConfig.js
import { Address as Address3, beginCell as beginCell3, toNano } from "@ton/core";

// src/contracts/BondingCurve.ts
import {
  Cell,
  Slice,
  Builder,
  beginCell,
  Dictionary,
  contractAddress,
  TupleBuilder
} from "@ton/core";
function storeDeploy(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(2490013878, 32);
    b_0.storeUint(src.queryId, 64);
  };
}
function storeJettonTransferNotification(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1935855772, 32);
    b_0.storeUint(src.queryId, 64);
    b_0.storeCoins(src.amount);
    b_0.storeAddress(src.sender);
    b_0.storeBuilder(src.forwardPayload.asBuilder());
  };
}
function storeBuy(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1112889633, 32);
    b_0.storeUint(src.queryId, 64);
    b_0.storeCoins(src.minTokensOut);
  };
}
function storeSetJettonWallet(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1464161354, 32);
    b_0.storeAddress(src.wallet);
  };
}
function storeGraduate(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1196572996, 32);
    b_0.storeUint(src.queryId, 64);
  };
}
function storeJettonExcesses(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(3576854235, 32);
    b_0.storeUint(src.queryId, 64);
  };
}
function loadGetterTupleCurveData(source) {
  const _virtualTon = source.readBigNumber();
  const _virtualTokens = source.readBigNumber();
  const _realTon = source.readBigNumber();
  const _tokensSold = source.readBigNumber();
  const _tokensForSale = source.readBigNumber();
  const _graduationTon = source.readBigNumber();
  const _feeBps = source.readBigNumber();
  const _graduated = source.readBoolean();
  const _jettonWallet = source.readAddressOpt();
  return { $$type: "CurveData", virtualTon: _virtualTon, virtualTokens: _virtualTokens, realTon: _realTon, tokensSold: _tokensSold, tokensForSale: _tokensForSale, graduationTon: _graduationTon, feeBps: _feeBps, graduated: _graduated, jettonWallet: _jettonWallet };
}
function initBondingCurve_init_args(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeAddress(src.admin);
    b_0.storeAddress(src.jettonMaster);
    b_0.storeAddress(src.feeWallet);
    const b_1 = new Builder();
    b_1.storeAddress(src.graduationDestination);
    b_1.storeInt(src.virtualTon, 257);
    b_1.storeInt(src.virtualTokens, 257);
    const b_2 = new Builder();
    b_2.storeInt(src.tokensForSale, 257);
    b_2.storeInt(src.graduationTon, 257);
    b_2.storeInt(src.feeBps, 257);
    b_1.storeRef(b_2.endCell());
    b_0.storeRef(b_1.endCell());
  };
}
async function BondingCurve_init(admin, jettonMaster, feeWallet, graduationDestination, virtualTon, virtualTokens, tokensForSale, graduationTon, feeBps) {
  const __code = Cell.fromHex("b5ee9c724102390100109b00022cff008e88f4a413f4bcf2c80bed53208e8130e1ed43d9010d0202710207020120030403b1b9156ed44d0d200018eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700810101d700810101d7003010691068106709d15507e30d1111111211111110111111100f11100f550edb3c57105f0f6c2180e0f200202750506038ca811ed44d0d200018eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700810101d700810101d7003010691068106709d15507e30ddb3c57105f0f6c210e0f3203b0ab42ed44d0d200018eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700810101d700810101d7003010691068106709d15507e30d1111111211111110111111100f11100f550edb3c57105f0f6c210e0f2f020120080c020120090b0389b4ec5da89a1a400031d65f481f481f481a803a1f481020203ae01020203ae01a861a1020203ae01020203ae01020203ae006020d220d020ce13a2aa0fc61bb678d932d93300e0f0a0012547dc75479ed547fbe038db52adda89a1a400031d65f481f481f481a803a1f481020203ae01020203ae01a861a1020203ae01020203ae01020203ae006020d220d020ce13a2aa0fc61bb678ae20be1ed84300e0f31038db9dcded44d0d200018eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700810101d700810101d7003010691068106709d15507e30ddb3c57105f0f6c2180e0f3004e001d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700810101d700810101d7003010691068106709d15507e30d1113e302705612d74920c21f97311112d31f1113de2182105745544aba0e0f101500ae6d702070706d7170258164c52ec200f2f48158922dc200f2f48200d6852cc200f2f48135c153cdb9f2f4812b632bc200f2f48171532ac2ff952a8103e8bb9170e2f2f453dca853dca1a9048200d8ee511fa152c0bbf2f4009cfa40fa40fa40d401d0fa40fa00fa00fa00fa00d30fd430d0d72c01916d93fa4001e201fa00fa00d200d200f404d33fd200fa00300f11120f0f11110f0f11100f57121110111111100f11100f550e01fc11118020d72120d749c1608e66300f11110f0e11100e10df551cc87f01ca0011121111111055e0011111011112ce1fce1dce0bc8ce500afa025008fa025006fa025004fa0212cb0fc858206e9430cf84809201cee258fa0258fa0212ca0012ca0013f40013cb3f13ca005003fa02cdcdc9ed54e0d31f0182100f8a7ea5bd1101f28e66300f11110f0e11100e10df551cc87f01ca0011121111111055e0011111011112ce1fce1dce0bc8ce500afa025008fa025006fa025004fa0212cb0fc858206e9430cf84809201cee258fa0258fa0212ca0012ca0013f40013cb3f13ca005003fa02cdcdc9ed54e0d33f302280402259f40f6fa192306ddf1203f8206e92306d9fd0fa40fa00fa00d20055306c146f04e2206ee302206ef2d0806f243056148ec602804050237fc855305034ce01fa0201fa02ca00c9103412206e953059f45b30944133f417e20f11110f0e11100e10df10ce10bd10ac109b108a107910681057104610354143e150358040f45b305182a15074a124b313381400cc5b0f11110f0e11100e10df551cc87f01ca0011121111111055e0011111011112ce1fce1dce0bc8ce500afa025008fa025006fa025004fa0212cb0fc858206e9430cf84809201cee258fa0258fa0212ca0012ca0013f40013cb3f13ca005003fa02cdcdc9ed5401ca93533ab99170e2927036de50667270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb000f11110f0e11100e10df10ce10bd10ac109b108a107910681710461035404438049ae30221821042555921ba8f385b1111d33ffa00301111111311111110111211100f11110f0e11100e10df10ce10bd10ac109b108a1079106810571046103510241023db3ce02182107362d09cba162c381700fc5b1111fa403081557df8425612c705f2f481122f086e18f2f40f11110f0e11100e10df551cc87f01ca0011121111111055e0011111011112ce1fce1dce0bc8ce500afa025008fa025006fa025004fa0212cb0fc858206e9430cf84809201cee258fa0258fa0212ca0012ca0013f40013cb3f13ca005003fa02cdcdc9ed5404fe8ffd5b1111d33f31fa00fa401111111211111110111211100f11120f0e11120e0d11120d0c11120c0b11120b0a11120a0911120908111208071112070611120605111205041112040311120302111202011113011114db3c8152b8f84258c705f2f481606326b3f2f48200d7aa5613c200f2f421b39456122cbe9170e2e3022d181e2401d85b571157110d11100d10cf10be552a7f01db3cc87f01ca0011121111111055e0011111011112ce1fce1dce0bc8ce500afa025008fa025006fa025004fa0212cb0fc858206e9430cf84809201cee258fa0258fa0212ca0012ca0013f40013cb3f13ca005003fa02cdcdc9ed541903f6db3c6d258040f4876fa520911295316d326d01e2908ee3206e92306d9fd0fa40fa00fa00d20055306c146f04e2206ef2d0806f24208e29431380405024c855305034ce01fa0201fa02ca00c922103401206e953059f45b30944133f417e25055e30d8040270259f47c6fa5209402d4305895316d326d01e21037e82d1a1d02fc3028a48040705445505246c855305034ce01fa0201fa02ca00c9463052a0206e953059f45b30944133f417e2821004c4b4007ff8286d7070c8ca00c9d0106e105a1048c8556082100f8a7ea55008cb1f16cb3f5004fa0212ce01206e9430cf84809201cee2f40001fa02cec92545337050346d036d5520c8cf8580ca00891b1c0001100052cf16ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00000a10235f033403fe8125a1561328bbf2f41111111211111110111111100f11100f550e1114db3c1111111211111110111211100f11120f0e11120e0d11120d0c11120c0b11120b0a11120a09111209111208070655405614db3c530aa8812710a9045ca1814c9021c200f2f420815be01117be01111601f2f481400d532abbf2f45099a11115171f2022006620d749c101923070e0d20001923070e020d749c120923070e0d31f01821053454c4cbd923070e020d749c104923070e0fa003004f420c101923070e01111111211111110111211100f11120f0e11120e0d11120d0c11120c0b11120b0a11120a0911120911120807065540db3c011113a01112db3c5613a0a5011113a9041112db3c011113a120c1009e301110111111100f11100f550e70e01111111211111110111111100f11100f10ef10de10cd32303121002810bc10ab109a108910781067105610451034413001fca127c2008e3b52f87270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb009137e20111120111117070036d6d50436d5033c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e22300faf400c901fb000e11110e0d11100d10cf10be10ad109c108b107a10691058105710465522c87f01ca0011121111111055e0011111011112ce1fce1dce0bc8ce500afa025008fa025006fa025004fa0212cb0fc858206e9430cf84809201cee258fa0258fa0212ca0012ca0013f40013cb3f13ca005003fa02cdcdc9ed5404b2e0218210d53276dbba8eac5b1111d33f30588040f45b300f11110f0e11100e10df10ce10bd10ac109b108a107910681057104610354143e021821047524144bae302218210946a98b6bae3025713c0001112c12101111201b038252a2b04bc5b1111d33f3081207625f2f48140ea24b3f2f41110111111100f11100f10ef10de10cd10bc10ab109a10891078106710561045103411124130db3c357f5317a120c2009430355712e30d7027c2009137e30d1110111111100f11100f550e2d26293802fc3821821008f0d18072706d820afaf08070c8ca00c9d004111a04103e56160356174133c8556082100f8a7ea55008cb1f16cb3f5004fa0212ce01206e9430cf84809201cee2f40001fa02cec9104813021116021a10246d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf818ae2f400c901fb002728001a58cf8680cf8480f400f400cf81000c031111031035007652e87270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0001bc5b1111d33f30c8018210aff90f5758cb1fcb3fc91110111211100f11110f0e11100e10df10ce10bd10ac109b108a10791068105710461035443012f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb003802788f3270201111111311111110111211100f11110f0e11100e10df10ce10bd10ac109b108a1079106810571046103510241023db3ce05f0f5f03f2c0822c3802f63181606327b3f2f41111111211111110111211100f11120f0e11120e0d11120d0c11120c0b11120b0a11120a0911120911120807065540db3cf8416f24135f038200c07d21821007270e00bcf2f4821007270e00a1530ba8812710a90466a1814c9021c200f2f41111111411111110111311100f11120f0e11140e2d2e001853886eb3f2e444206ef2d08003f00d11130d0c11120c0b11140b0a11130a09111209081114080711130706111206051114050411130403111203021114020111130111125612db3c814c9021c200f2f48200ea395381a02ebbf2f420815be01118be01111701f2f4075612a0065615a05613c200925713e30d21a48040f842011114561770c82f343504f420c101923070e01111111211111110111211100f11120f0e11120e0d11120d0c11120c0b11120b0a11120a0911120911120807065540db3c011113a01112db3c011113a9041112db3c011113a120c1009e301110111111100f11100f550e70e01111111211111110111111100f11100f10ef10de10cd10bc10ab3130323302c4db3c1111111211111110111211100f11120f0e11120e0d11120d0c11120c0b11120b0a11120a0911120911120807065540db3c01111301a81111111211111110111111100f11100f10ef10de10cd10bc10ab109a10891078106710561045103441303132000653d7a0000653c6a10020109a1089107810671056104510344130007a52f011147270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0001fe55305034ce01fa0201fa02ca00c91024011113015230206e953059f45b30944133f417e2821004c4b4007ff842f8286d7070c8ca00c9d0106805111b05c8556082100f8a7ea55008cb1f16cb3f5004fa0212ce01206e9430cf84809201cee2f40001fa02cec903111403011115017050346d036d5520c8cf8580ca00cf844036018ece01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb000d11110d0c11100c10bf10ae109d108c107b106a10591048102746440503db3c37001a25b393537abe9170e2927f36de00b2c87f01ca0011121111111055e0011111011112ce1fce1dce0bc8ce500afa025008fa025006fa025004fa0212cb0fc858206e9430cf84809201cee258fa0258fa0212ca0012ca0013f40013cb3f13ca005003fa02cdcdc9ed5461ec4f56");
  const builder = beginCell();
  builder.storeUint(0, 1);
  initBondingCurve_init_args({ $$type: "BondingCurve_init_args", admin, jettonMaster, feeWallet, graduationDestination, virtualTon, virtualTokens, tokensForSale, graduationTon, feeBps })(builder);
  const __data = builder.endCell();
  return { code: __code, data: __data };
}
var BondingCurve_errors = {
  2: { message: "Stack underflow" },
  3: { message: "Stack overflow" },
  4: { message: "Integer overflow" },
  5: { message: "Integer out of expected range" },
  6: { message: "Invalid opcode" },
  7: { message: "Type check error" },
  8: { message: "Cell overflow" },
  9: { message: "Cell underflow" },
  10: { message: "Dictionary error" },
  11: { message: "'Unknown' error" },
  12: { message: "Fatal error" },
  13: { message: "Out of gas error" },
  14: { message: "Virtualization error" },
  32: { message: "Action list is invalid" },
  33: { message: "Action list is too long" },
  34: { message: "Action is invalid or not supported" },
  35: { message: "Invalid source address in outbound message" },
  36: { message: "Invalid destination address in outbound message" },
  37: { message: "Not enough Toncoin" },
  38: { message: "Not enough extra currencies" },
  39: { message: "Outbound message does not fit into a cell after rewriting" },
  40: { message: "Cannot process a message" },
  41: { message: "Library reference is null" },
  42: { message: "Library change action error" },
  43: { message: "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree" },
  50: { message: "Account state size exceeded limits" },
  128: { message: "Null reference exception" },
  129: { message: "Invalid serialization prefix" },
  130: { message: "Invalid incoming message" },
  131: { message: "Constraints error" },
  132: { message: "Access denied" },
  133: { message: "Contract stopped" },
  134: { message: "Invalid argument" },
  135: { message: "Code of a contract was not found" },
  136: { message: "Invalid standard address" },
  138: { message: "Not a basechain address" },
  1092: { message: "jetton wallet not set" },
  4655: { message: "jetton wallet already set" },
  8310: { message: "threshold not reached" },
  9633: { message: "more tokens than sold" },
  11107: { message: "graduationTon must be positive" },
  13761: { message: "tokensForSale must be below virtualTokens" },
  16397: { message: "reserve underflow" },
  16618: { message: "already moved" },
  19600: { message: "amount too small" },
  21176: { message: "unknown jetton wallet" },
  21885: { message: "only admin" },
  22674: { message: "virtualTokens must be positive" },
  23520: { message: "slippage" },
  24675: { message: "curve graduated" },
  25797: { message: "virtualTon must be positive" },
  29011: { message: "feeBps out of range" },
  49277: { message: "not enough value for gas" },
  54917: { message: "tokensForSale must be positive" },
  55210: { message: "empty transfer" },
  55534: { message: "graduationTon unreachable" },
  59961: { message: "not enough tokens left" }
};
var BondingCurve_errors_backward = {
  "Stack underflow": 2,
  "Stack overflow": 3,
  "Integer overflow": 4,
  "Integer out of expected range": 5,
  "Invalid opcode": 6,
  "Type check error": 7,
  "Cell overflow": 8,
  "Cell underflow": 9,
  "Dictionary error": 10,
  "'Unknown' error": 11,
  "Fatal error": 12,
  "Out of gas error": 13,
  "Virtualization error": 14,
  "Action list is invalid": 32,
  "Action list is too long": 33,
  "Action is invalid or not supported": 34,
  "Invalid source address in outbound message": 35,
  "Invalid destination address in outbound message": 36,
  "Not enough Toncoin": 37,
  "Not enough extra currencies": 38,
  "Outbound message does not fit into a cell after rewriting": 39,
  "Cannot process a message": 40,
  "Library reference is null": 41,
  "Library change action error": 42,
  "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree": 43,
  "Account state size exceeded limits": 50,
  "Null reference exception": 128,
  "Invalid serialization prefix": 129,
  "Invalid incoming message": 130,
  "Constraints error": 131,
  "Access denied": 132,
  "Contract stopped": 133,
  "Invalid argument": 134,
  "Code of a contract was not found": 135,
  "Invalid standard address": 136,
  "Not a basechain address": 138,
  "jetton wallet not set": 1092,
  "jetton wallet already set": 4655,
  "threshold not reached": 8310,
  "more tokens than sold": 9633,
  "graduationTon must be positive": 11107,
  "tokensForSale must be below virtualTokens": 13761,
  "reserve underflow": 16397,
  "already moved": 16618,
  "amount too small": 19600,
  "unknown jetton wallet": 21176,
  "only admin": 21885,
  "virtualTokens must be positive": 22674,
  "slippage": 23520,
  "curve graduated": 24675,
  "virtualTon must be positive": 25797,
  "feeBps out of range": 29011,
  "not enough value for gas": 49277,
  "tokensForSale must be positive": 54917,
  "empty transfer": 55210,
  "graduationTon unreachable": 55534,
  "not enough tokens left": 59961
};
var BondingCurve_types = [
  { "name": "DataSize", "header": null, "fields": [{ "name": "cells", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "bits", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "refs", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }] },
  { "name": "SignedBundle", "header": null, "fields": [{ "name": "signature", "type": { "kind": "simple", "type": "fixed-bytes", "optional": false, "format": 64 } }, { "name": "signedData", "type": { "kind": "simple", "type": "slice", "optional": false, "format": "remainder" } }] },
  { "name": "StateInit", "header": null, "fields": [{ "name": "code", "type": { "kind": "simple", "type": "cell", "optional": false } }, { "name": "data", "type": { "kind": "simple", "type": "cell", "optional": false } }] },
  { "name": "Context", "header": null, "fields": [{ "name": "bounceable", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "sender", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "raw", "type": { "kind": "simple", "type": "slice", "optional": false } }] },
  { "name": "SendParameters", "header": null, "fields": [{ "name": "mode", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "body", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "code", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "data", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "to", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "bounce", "type": { "kind": "simple", "type": "bool", "optional": false } }] },
  { "name": "MessageParameters", "header": null, "fields": [{ "name": "mode", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "body", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "to", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "bounce", "type": { "kind": "simple", "type": "bool", "optional": false } }] },
  { "name": "DeployParameters", "header": null, "fields": [{ "name": "mode", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "body", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "bounce", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "init", "type": { "kind": "simple", "type": "StateInit", "optional": false } }] },
  { "name": "StdAddress", "header": null, "fields": [{ "name": "workchain", "type": { "kind": "simple", "type": "int", "optional": false, "format": 8 } }, { "name": "address", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 256 } }] },
  { "name": "VarAddress", "header": null, "fields": [{ "name": "workchain", "type": { "kind": "simple", "type": "int", "optional": false, "format": 32 } }, { "name": "address", "type": { "kind": "simple", "type": "slice", "optional": false } }] },
  { "name": "BasechainAddress", "header": null, "fields": [{ "name": "hash", "type": { "kind": "simple", "type": "int", "optional": true, "format": 257 } }] },
  { "name": "Deploy", "header": 2490013878, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] },
  { "name": "DeployOk", "header": 2952335191, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] },
  { "name": "FactoryDeploy", "header": 1829761339, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "cashback", "type": { "kind": "simple", "type": "address", "optional": false } }] },
  { "name": "JettonTransfer", "header": 260734629, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "amount", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "destination", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "responseDestination", "type": { "kind": "simple", "type": "address", "optional": true } }, { "name": "customPayload", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "forwardTonAmount", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "forwardPayload", "type": { "kind": "simple", "type": "slice", "optional": false, "format": "remainder" } }] },
  { "name": "JettonTransferNotification", "header": 1935855772, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "amount", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "sender", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "forwardPayload", "type": { "kind": "simple", "type": "slice", "optional": false, "format": "remainder" } }] },
  { "name": "Buy", "header": 1112889633, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "minTokensOut", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }] },
  { "name": "SetJettonWallet", "header": 1464161354, "fields": [{ "name": "wallet", "type": { "kind": "simple", "type": "address", "optional": false } }] },
  { "name": "Graduate", "header": 1196572996, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] },
  { "name": "JettonExcesses", "header": 3576854235, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] },
  { "name": "PendingBuy", "header": null, "fields": [{ "name": "buyer", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "ton", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "tokens", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "failed", "type": { "kind": "simple", "type": "bool", "optional": false } }] },
  { "name": "CurveData", "header": null, "fields": [{ "name": "virtualTon", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "virtualTokens", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "realTon", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "tokensSold", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "tokensForSale", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "graduationTon", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "feeBps", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "graduated", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "jettonWallet", "type": { "kind": "simple", "type": "address", "optional": true } }] },
  { "name": "BondingCurve$Data", "header": null, "fields": [{ "name": "admin", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "jettonMaster", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "feeWallet", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "graduationDestination", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "virtualTon", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "virtualTokens", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "tokensForSale", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "graduationTon", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "feeBps", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 16 } }, { "name": "jettonWallet", "type": { "kind": "simple", "type": "address", "optional": true } }, { "name": "realTon", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "tokensSold", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "graduated", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "liquidityMoved", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "pending", "type": { "kind": "dict", "key": "uint", "keyFormat": 64, "value": "PendingBuy", "valueFormat": "ref" } }, { "name": "nextQueryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "supplyReady", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "supplyReceived", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }] }
];
var BondingCurve_opcodes = {
  "Deploy": 2490013878,
  "DeployOk": 2952335191,
  "FactoryDeploy": 1829761339,
  "JettonTransfer": 260734629,
  "JettonTransferNotification": 1935855772,
  "Buy": 1112889633,
  "SetJettonWallet": 1464161354,
  "Graduate": 1196572996,
  "JettonExcesses": 3576854235
};
var BondingCurve_getters = [
  { "name": "tonReserve", "methodId": 108886, "arguments": [], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "tokenReserve", "methodId": 92177, "arguments": [], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "k", "methodId": 122317, "arguments": [], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "tokensOutFor", "methodId": 94018, "arguments": [{ "name": "tonIn", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "tonOutFor", "methodId": 69974, "arguments": [{ "name": "tokensIn", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "data", "methodId": 100194, "arguments": [], "returnType": { "kind": "simple", "type": "CurveData", "optional": false } }
];
var BondingCurve_receivers = [
  { "receiver": "internal", "message": { "kind": "typed", "type": "SetJettonWallet" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "Buy" } },
  { "receiver": "internal", "message": { "kind": "empty" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "JettonTransferNotification" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "JettonExcesses" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "Graduate" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "Deploy" } }
];
var BondingCurve = class _BondingCurve {
  static GasBuyOverhead = 120000000n;
  static GasJettonTransfer = 80000000n;
  static MinContractBalance = 50000000n;
  static GasGraduationTransfer = 150000000n;
  static GasGraduationNotify = 50000000n;
  static storageReserve = 0n;
  static errors = BondingCurve_errors_backward;
  static opcodes = BondingCurve_opcodes;
  static async init(admin, jettonMaster, feeWallet, graduationDestination, virtualTon, virtualTokens, tokensForSale, graduationTon, feeBps) {
    return await BondingCurve_init(admin, jettonMaster, feeWallet, graduationDestination, virtualTon, virtualTokens, tokensForSale, graduationTon, feeBps);
  }
  static async fromInit(admin, jettonMaster, feeWallet, graduationDestination, virtualTon, virtualTokens, tokensForSale, graduationTon, feeBps) {
    const __gen_init = await BondingCurve_init(admin, jettonMaster, feeWallet, graduationDestination, virtualTon, virtualTokens, tokensForSale, graduationTon, feeBps);
    const address3 = contractAddress(0, __gen_init);
    return new _BondingCurve(address3, __gen_init);
  }
  static fromAddress(address3) {
    return new _BondingCurve(address3);
  }
  address;
  init;
  abi = {
    types: BondingCurve_types,
    getters: BondingCurve_getters,
    receivers: BondingCurve_receivers,
    errors: BondingCurve_errors
  };
  constructor(address3, init) {
    this.address = address3;
    this.init = init;
  }
  async send(provider, via, args, message) {
    let body = null;
    if (message && typeof message === "object" && !(message instanceof Slice) && message.$$type === "SetJettonWallet") {
      body = beginCell().store(storeSetJettonWallet(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice) && message.$$type === "Buy") {
      body = beginCell().store(storeBuy(message)).endCell();
    }
    if (message === null) {
      body = new Cell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice) && message.$$type === "JettonTransferNotification") {
      body = beginCell().store(storeJettonTransferNotification(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice) && message.$$type === "JettonExcesses") {
      body = beginCell().store(storeJettonExcesses(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice) && message.$$type === "Graduate") {
      body = beginCell().store(storeGraduate(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice) && message.$$type === "Deploy") {
      body = beginCell().store(storeDeploy(message)).endCell();
    }
    if (body === null) {
      throw new Error("Invalid message type");
    }
    await provider.internal(via, { ...args, body });
  }
  async getTonReserve(provider) {
    const builder = new TupleBuilder();
    const source = (await provider.get("tonReserve", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getTokenReserve(provider) {
    const builder = new TupleBuilder();
    const source = (await provider.get("tokenReserve", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getK(provider) {
    const builder = new TupleBuilder();
    const source = (await provider.get("k", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getTokensOutFor(provider, tonIn) {
    const builder = new TupleBuilder();
    builder.writeNumber(tonIn);
    const source = (await provider.get("tokensOutFor", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getTonOutFor(provider, tokensIn) {
    const builder = new TupleBuilder();
    builder.writeNumber(tokensIn);
    const source = (await provider.get("tonOutFor", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getData(provider) {
    const builder = new TupleBuilder();
    const source = (await provider.get("data", builder.build())).stack;
    const result = loadGetterTupleCurveData(source);
    return result;
  }
};

// src/contracts/LiquidityPool.ts
import {
  Cell as Cell2,
  Slice as Slice2,
  Builder as Builder2,
  beginCell as beginCell2,
  Dictionary as Dictionary2,
  contractAddress as contractAddress2,
  TupleBuilder as TupleBuilder2
} from "@ton/core";
function storeDeploy2(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(2490013878, 32);
    b_0.storeUint(src.queryId, 64);
  };
}
function storeJettonTransferNotification2(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1935855772, 32);
    b_0.storeUint(src.queryId, 64);
    b_0.storeCoins(src.amount);
    b_0.storeAddress(src.sender);
    b_0.storeBuilder(src.forwardPayload.asBuilder());
  };
}
function storeJettonExcesses2(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(3576854235, 32);
    b_0.storeUint(src.queryId, 64);
  };
}
function storePoolBuy(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1346524505, 32);
    b_0.storeUint(src.queryId, 64);
    b_0.storeCoins(src.minTokensOut);
  };
}
function storeSetJettonWallet2(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1464161354, 32);
    b_0.storeAddress(src.wallet);
  };
}
function storeSetCurve(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeUint(1396920918, 32);
    b_0.storeAddress(src.curve);
  };
}
function loadGetterTuplePoolData(source) {
  const _tonReserve = source.readBigNumber();
  const _tokenReserve = source.readBigNumber();
  const _feeBps = source.readBigNumber();
  const _ready = source.readBoolean();
  const _curve = source.readAddressOpt();
  const _jettonMaster = source.readAddress();
  const _jettonWallet = source.readAddressOpt();
  return { $$type: "PoolData", tonReserve: _tonReserve, tokenReserve: _tokenReserve, feeBps: _feeBps, ready: _ready, curve: _curve, jettonMaster: _jettonMaster, jettonWallet: _jettonWallet };
}
function initLiquidityPool_init_args(src) {
  return (builder) => {
    const b_0 = builder;
    b_0.storeAddress(src.admin);
    b_0.storeAddress(src.jettonMaster);
    b_0.storeAddress(src.feeWallet);
    const b_1 = new Builder2();
    b_1.storeInt(src.feeBps, 257);
    b_0.storeRef(b_1.endCell());
  };
}
async function LiquidityPool_init(admin, jettonMaster, feeWallet, feeBps) {
  const __code = Cell2.fromHex("b5ee9c7241022601000c2d00025aff008e88f4a413f4bcf2c80bed53208e983001d072d721d200d200fa4021103450666f04f86102f862e1ed43d9010b02027102070201200306020120040501f5b62adda89a1a400031c71f481f481f481a61fa803a1ae580322db27f48003c403ae580322db27f48003c403f401f401a401a401e809a67e602118211621142112d8391c5ff481f481f481a803a1020203ae006028866009a2aa04dadae040e0e0dae302e2a65385ff2a530207d17722e1c5e5e9c4aa17b678d98301901f1b7133da89a1a400031c71f481f481f481a61fa803a1ae580322db27f48003c403ae580322db27f48003c403f401f401a401a401e809a67e602118211621142112d8391c5ff481f481f481a803a1020203ae006028866009a2aa04dadae040e0e0dae302e2a65385ff2a530207d17722e1c5e5e9c5b678d98302201f5baf42ed44d0d200018e38fa40fa40fa40d30fd401d0d72c01916d93fa4001e201d72c01916d93fa4001e201fa00fa00d200d200f404d33f30108c108b108a10896c1c8e2ffa40fa40fa40d401d0810101d7003014433004d155026d6d702070706d7181715329c2ff95298103e8bb9170e2f2f4e2550bdb3c6cc1821020120080a01f1b8762ed44d0d200018e38fa40fa40fa40d30fd401d0d72c01916d93fa4001e201d72c01916d93fa4001e201fa00fa00d200d200f404d33f30108c108b108a10896c1c8e2ffa40fa40fa40d401d0810101d7003014433004d155026d6d702070706d7181715329c2ff95298103e8bb9170e2f2f4e2db3c6cc7809014c54754855b2db3c103f4ed05477b80f11120f0e11110e0d11100d10cf10be10ad109c108b107a2201f1b9dcded44d0d200018e38fa40fa40fa40d30fd401d0d72c01916d93fa4001e201d72c01916d93fa4001e201fa00fa00d200d200f404d33f30108c108b108a10896c1c8e2ffa40fa40fa40d401d0810101d7003014433004d155026d6d702070706d7181715329c2ff95298103e8bb9170e2f2f4e2db3c6cc182303feed44d0d200018e38fa40fa40fa40d30fd401d0d72c01916d93fa4001e201d72c01916d93fa4001e201fa00fa00d200d200f404d33f30108c108b108a10896c1c8e2ffa40fa40fa40d401d0810101d7003014433004d155026d6d702070706d7181715329c2ff95298103e8bb9170e2f2f4e20de302702cd74920c21fe300210c101102de0b8020d72120d749c1608e4630109b5518c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed54e0d31f0182100f8a7ea5bde302d33f302b80402259f40f6fa192306ddf0d0e008c30109b5518c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed5401f4206e92306d9fd0fa40fa00fa00d20055306c146f04e2206e8e465b109b5518c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed54e0206ef2d0806f2430503e8040f45b305162a1505da0504472700f018e136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00109b108a1079106810571046104540341c000a310cd31f0d03f682105745544aba8e5c5b0bfa403081557df8422cc705f2f481122f076e17f2f4109b5518c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed54e021821053435256bae30221821050425559bae3022112131400ba5b0bfa403081557df8422cc705f2f482009d43066e16f2f4109b5518c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed5401bc5b0bd33f31fa003010ac109b108a10791068105710461035443012db3cc87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed541f03fe82107362d09cbae302218210d53276dbba8e5d5b0bd33f30500b8040f45b30109b108a107910681057104610354403c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed54e0218210946a98b6bae3023dc0000c151b1d04d65b0bd33f31fa00fa4010bc10ac109c108c107c106c105c104c103c4cdedb3c8152b8f84258c705f2f48200d7aa2dc200f2f422b393266eb39170e29a26206ef2d08052e0c7059170e2e30255a08200b8880cdb3c1df2f410ac109b108a107910681057104610354014503e20162217009c323c3c09a0107a106955257f02c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed5403f6db3c55b02edb3c5309a8812710a9045ca1814c9021c200f2f420815be01111be01111001f2f48200b1875328b9f2f45077a1505fa025c2008e3b52967270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb009135e250cb7018191a006620d749c101923070e0d20001923070e020d749c120923070e0d31f01821053454c4cbd923070e020d749c104923070e0fa003002aa20c101917f8e9b55b0db3cb310cd10bc10ab109a1089107810671056104510344130e2923070e05250a055b0db3c2da0a5500da9045250a120c1009430550a70e010bc10ab109a10891078106710561045103441302223018e70036d6d50436d5033c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00108b107a106910581047103644331c01925b0bd33f30c8018210aff90f5758cb1fcb3fc910ac109b108a10791068105710461035443012f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb001c0082c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed5402dac1211cb08f61246eb39af84225206ef2d080c7059170e29221b39170e2e302109b551870db3cc87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed54e05f0cf2c0821e1f00d431f8416f24135f03820afaf080a1816f7121c200f2f413a0108a1079106810571046103550347f5520c87f01ca0055b050bcce19ce17ce15cb0fc85004206e9430cf84809201cee258206e9430cf84809201cee201fa0258fa0212ca0012ca0012f40012cb3fcdc9ed5404f010ac5e38107b106c105b104c103b4cbc8200b8880cdb3c1df2f4550adb3cf8416f24135f038200c07d21821007270e00bcf2f4821007270e00a1530aa8812710a90466a1814c9021c200f2f455b22cdb3c814c9021c200f2f48200b1875316b9f2f420815be01112be01111101f2f4515ca0514fa12dc20022202124001853776eb3f2e444206ef2d08002a420c101917f8e9b55b0db3cb310cd10bc10ab109a1089107810671056104510344130e2923070e05260a055b0db3c500da9045240a120c1009430550a70e010bc10ab109a1089107810671056104510344130222300282391229170e29325c2009170e29324c2009170e200065354a801fc8e3b529e7270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00913de224a48040f842500e561170c855305034ce01fa0201fa02ca00c9542d60206e953059f45b30944133f417e2821004c4b4007ff842f8286d7070c8ca00c9d02500f2106b05111505c8556082100f8a7ea55008cb1f16cb3f5004fa0212ce01206e9430cf84809201cee2f40001fa02cec9103e45f07050346d036d5520c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00107b106a10591048103746154134d87828ac");
  const builder = beginCell2();
  builder.storeUint(0, 1);
  initLiquidityPool_init_args({ $$type: "LiquidityPool_init_args", admin, jettonMaster, feeWallet, feeBps })(builder);
  const __data = builder.endCell();
  return { code: __code, data: __data };
}
var LiquidityPool_errors = {
  2: { message: "Stack underflow" },
  3: { message: "Stack overflow" },
  4: { message: "Integer overflow" },
  5: { message: "Integer out of expected range" },
  6: { message: "Invalid opcode" },
  7: { message: "Type check error" },
  8: { message: "Cell overflow" },
  9: { message: "Cell underflow" },
  10: { message: "Dictionary error" },
  11: { message: "'Unknown' error" },
  12: { message: "Fatal error" },
  13: { message: "Out of gas error" },
  14: { message: "Virtualization error" },
  32: { message: "Action list is invalid" },
  33: { message: "Action list is too long" },
  34: { message: "Action is invalid or not supported" },
  35: { message: "Invalid source address in outbound message" },
  36: { message: "Invalid destination address in outbound message" },
  37: { message: "Not enough Toncoin" },
  38: { message: "Not enough extra currencies" },
  39: { message: "Outbound message does not fit into a cell after rewriting" },
  40: { message: "Cannot process a message" },
  41: { message: "Library reference is null" },
  42: { message: "Library change action error" },
  43: { message: "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree" },
  50: { message: "Account state size exceeded limits" },
  128: { message: "Null reference exception" },
  129: { message: "Invalid serialization prefix" },
  130: { message: "Invalid incoming message" },
  131: { message: "Constraints error" },
  132: { message: "Access denied" },
  133: { message: "Contract stopped" },
  134: { message: "Invalid argument" },
  135: { message: "Code of a contract was not found" },
  136: { message: "Invalid standard address" },
  138: { message: "Not a basechain address" },
  1092: { message: "jetton wallet not set" },
  4655: { message: "jetton wallet already set" },
  19600: { message: "amount too small" },
  21176: { message: "unknown jetton wallet" },
  21885: { message: "only admin" },
  23520: { message: "slippage" },
  28529: { message: "liquidity too small" },
  29011: { message: "feeBps out of range" },
  40259: { message: "curve already set" },
  45447: { message: "not enough liquidity" },
  47240: { message: "pool not ready" },
  49277: { message: "not enough value for gas" },
  55210: { message: "empty transfer" }
};
var LiquidityPool_errors_backward = {
  "Stack underflow": 2,
  "Stack overflow": 3,
  "Integer overflow": 4,
  "Integer out of expected range": 5,
  "Invalid opcode": 6,
  "Type check error": 7,
  "Cell overflow": 8,
  "Cell underflow": 9,
  "Dictionary error": 10,
  "'Unknown' error": 11,
  "Fatal error": 12,
  "Out of gas error": 13,
  "Virtualization error": 14,
  "Action list is invalid": 32,
  "Action list is too long": 33,
  "Action is invalid or not supported": 34,
  "Invalid source address in outbound message": 35,
  "Invalid destination address in outbound message": 36,
  "Not enough Toncoin": 37,
  "Not enough extra currencies": 38,
  "Outbound message does not fit into a cell after rewriting": 39,
  "Cannot process a message": 40,
  "Library reference is null": 41,
  "Library change action error": 42,
  "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree": 43,
  "Account state size exceeded limits": 50,
  "Null reference exception": 128,
  "Invalid serialization prefix": 129,
  "Invalid incoming message": 130,
  "Constraints error": 131,
  "Access denied": 132,
  "Contract stopped": 133,
  "Invalid argument": 134,
  "Code of a contract was not found": 135,
  "Invalid standard address": 136,
  "Not a basechain address": 138,
  "jetton wallet not set": 1092,
  "jetton wallet already set": 4655,
  "amount too small": 19600,
  "unknown jetton wallet": 21176,
  "only admin": 21885,
  "slippage": 23520,
  "liquidity too small": 28529,
  "feeBps out of range": 29011,
  "curve already set": 40259,
  "not enough liquidity": 45447,
  "pool not ready": 47240,
  "not enough value for gas": 49277,
  "empty transfer": 55210
};
var LiquidityPool_types = [
  { "name": "DataSize", "header": null, "fields": [{ "name": "cells", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "bits", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "refs", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }] },
  { "name": "SignedBundle", "header": null, "fields": [{ "name": "signature", "type": { "kind": "simple", "type": "fixed-bytes", "optional": false, "format": 64 } }, { "name": "signedData", "type": { "kind": "simple", "type": "slice", "optional": false, "format": "remainder" } }] },
  { "name": "StateInit", "header": null, "fields": [{ "name": "code", "type": { "kind": "simple", "type": "cell", "optional": false } }, { "name": "data", "type": { "kind": "simple", "type": "cell", "optional": false } }] },
  { "name": "Context", "header": null, "fields": [{ "name": "bounceable", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "sender", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "raw", "type": { "kind": "simple", "type": "slice", "optional": false } }] },
  { "name": "SendParameters", "header": null, "fields": [{ "name": "mode", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "body", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "code", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "data", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "to", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "bounce", "type": { "kind": "simple", "type": "bool", "optional": false } }] },
  { "name": "MessageParameters", "header": null, "fields": [{ "name": "mode", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "body", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "to", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "bounce", "type": { "kind": "simple", "type": "bool", "optional": false } }] },
  { "name": "DeployParameters", "header": null, "fields": [{ "name": "mode", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "body", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "value", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "bounce", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "init", "type": { "kind": "simple", "type": "StateInit", "optional": false } }] },
  { "name": "StdAddress", "header": null, "fields": [{ "name": "workchain", "type": { "kind": "simple", "type": "int", "optional": false, "format": 8 } }, { "name": "address", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 256 } }] },
  { "name": "VarAddress", "header": null, "fields": [{ "name": "workchain", "type": { "kind": "simple", "type": "int", "optional": false, "format": 32 } }, { "name": "address", "type": { "kind": "simple", "type": "slice", "optional": false } }] },
  { "name": "BasechainAddress", "header": null, "fields": [{ "name": "hash", "type": { "kind": "simple", "type": "int", "optional": true, "format": 257 } }] },
  { "name": "Deploy", "header": 2490013878, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] },
  { "name": "DeployOk", "header": 2952335191, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] },
  { "name": "FactoryDeploy", "header": 1829761339, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "cashback", "type": { "kind": "simple", "type": "address", "optional": false } }] },
  { "name": "JettonTransfer", "header": 260734629, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "amount", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "destination", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "responseDestination", "type": { "kind": "simple", "type": "address", "optional": true } }, { "name": "customPayload", "type": { "kind": "simple", "type": "cell", "optional": true } }, { "name": "forwardTonAmount", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "forwardPayload", "type": { "kind": "simple", "type": "slice", "optional": false, "format": "remainder" } }] },
  { "name": "JettonTransferNotification", "header": 1935855772, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "amount", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "sender", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "forwardPayload", "type": { "kind": "simple", "type": "slice", "optional": false, "format": "remainder" } }] },
  { "name": "JettonExcesses", "header": 3576854235, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] },
  { "name": "PoolBuy", "header": 1346524505, "fields": [{ "name": "queryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }, { "name": "minTokensOut", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }] },
  { "name": "SetJettonWallet", "header": 1464161354, "fields": [{ "name": "wallet", "type": { "kind": "simple", "type": "address", "optional": false } }] },
  { "name": "SetCurve", "header": 1396920918, "fields": [{ "name": "curve", "type": { "kind": "simple", "type": "address", "optional": false } }] },
  { "name": "PoolPendingBuy", "header": null, "fields": [{ "name": "buyer", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "ton", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "tokens", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "failed", "type": { "kind": "simple", "type": "bool", "optional": false } }] },
  { "name": "PoolData", "header": null, "fields": [{ "name": "tonReserve", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "tokenReserve", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "feeBps", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }, { "name": "ready", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "curve", "type": { "kind": "simple", "type": "address", "optional": true } }, { "name": "jettonMaster", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "jettonWallet", "type": { "kind": "simple", "type": "address", "optional": true } }] },
  { "name": "LiquidityPool$Data", "header": null, "fields": [{ "name": "admin", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "jettonMaster", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "feeWallet", "type": { "kind": "simple", "type": "address", "optional": false } }, { "name": "feeBps", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 16 } }, { "name": "jettonWallet", "type": { "kind": "simple", "type": "address", "optional": true } }, { "name": "curve", "type": { "kind": "simple", "type": "address", "optional": true } }, { "name": "tonReserve", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "tokenReserve", "type": { "kind": "simple", "type": "uint", "optional": false, "format": "coins" } }, { "name": "tonFunded", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "tokensFunded", "type": { "kind": "simple", "type": "bool", "optional": false } }, { "name": "pending", "type": { "kind": "dict", "key": "uint", "keyFormat": 64, "value": "PoolPendingBuy", "valueFormat": "ref" } }, { "name": "nextQueryId", "type": { "kind": "simple", "type": "uint", "optional": false, "format": 64 } }] }
];
var LiquidityPool_opcodes = {
  "Deploy": 2490013878,
  "DeployOk": 2952335191,
  "FactoryDeploy": 1829761339,
  "JettonTransfer": 260734629,
  "JettonTransferNotification": 1935855772,
  "JettonExcesses": 3576854235,
  "PoolBuy": 1346524505,
  "SetJettonWallet": 1464161354,
  "SetCurve": 1396920918
};
var LiquidityPool_getters = [
  { "name": "k", "methodId": 122317, "arguments": [], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "ready", "methodId": 80025, "arguments": [], "returnType": { "kind": "simple", "type": "bool", "optional": false } },
  { "name": "tokensOutFor", "methodId": 94018, "arguments": [{ "name": "tonIn", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "tonOutFor", "methodId": 69974, "arguments": [{ "name": "tokensIn", "type": { "kind": "simple", "type": "int", "optional": false, "format": 257 } }], "returnType": { "kind": "simple", "type": "int", "optional": false, "format": 257 } },
  { "name": "data", "methodId": 100194, "arguments": [], "returnType": { "kind": "simple", "type": "PoolData", "optional": false } }
];
var LiquidityPool_receivers = [
  { "receiver": "internal", "message": { "kind": "typed", "type": "SetJettonWallet" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "SetCurve" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "PoolBuy" } },
  { "receiver": "internal", "message": { "kind": "empty" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "JettonTransferNotification" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "JettonExcesses" } },
  { "receiver": "internal", "message": { "kind": "typed", "type": "Deploy" } }
];
var LiquidityPool = class _LiquidityPool {
  static GasBuyOverhead = 120000000n;
  static GasJettonTransfer = 80000000n;
  static MinContractBalance = 50000000n;
  static storageReserve = 0n;
  static errors = LiquidityPool_errors_backward;
  static opcodes = LiquidityPool_opcodes;
  static async init(admin, jettonMaster, feeWallet, feeBps) {
    return await LiquidityPool_init(admin, jettonMaster, feeWallet, feeBps);
  }
  static async fromInit(admin, jettonMaster, feeWallet, feeBps) {
    const __gen_init = await LiquidityPool_init(admin, jettonMaster, feeWallet, feeBps);
    const address3 = contractAddress2(0, __gen_init);
    return new _LiquidityPool(address3, __gen_init);
  }
  static fromAddress(address3) {
    return new _LiquidityPool(address3);
  }
  address;
  init;
  abi = {
    types: LiquidityPool_types,
    getters: LiquidityPool_getters,
    receivers: LiquidityPool_receivers,
    errors: LiquidityPool_errors
  };
  constructor(address3, init) {
    this.address = address3;
    this.init = init;
  }
  async send(provider, via, args, message) {
    let body = null;
    if (message && typeof message === "object" && !(message instanceof Slice2) && message.$$type === "SetJettonWallet") {
      body = beginCell2().store(storeSetJettonWallet2(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice2) && message.$$type === "SetCurve") {
      body = beginCell2().store(storeSetCurve(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice2) && message.$$type === "PoolBuy") {
      body = beginCell2().store(storePoolBuy(message)).endCell();
    }
    if (message === null) {
      body = new Cell2();
    }
    if (message && typeof message === "object" && !(message instanceof Slice2) && message.$$type === "JettonTransferNotification") {
      body = beginCell2().store(storeJettonTransferNotification2(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice2) && message.$$type === "JettonExcesses") {
      body = beginCell2().store(storeJettonExcesses2(message)).endCell();
    }
    if (message && typeof message === "object" && !(message instanceof Slice2) && message.$$type === "Deploy") {
      body = beginCell2().store(storeDeploy2(message)).endCell();
    }
    if (body === null) {
      throw new Error("Invalid message type");
    }
    await provider.internal(via, { ...args, body });
  }
  async getK(provider) {
    const builder = new TupleBuilder2();
    const source = (await provider.get("k", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getReady(provider) {
    const builder = new TupleBuilder2();
    const source = (await provider.get("ready", builder.build())).stack;
    const result = source.readBoolean();
    return result;
  }
  async getTokensOutFor(provider, tonIn) {
    const builder = new TupleBuilder2();
    builder.writeNumber(tonIn);
    const source = (await provider.get("tokensOutFor", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getTonOutFor(provider, tokensIn) {
    const builder = new TupleBuilder2();
    builder.writeNumber(tokensIn);
    const source = (await provider.get("tonOutFor", builder.build())).stack;
    const result = source.readBigNumber();
    return result;
  }
  async getData(provider) {
    const builder = new TupleBuilder2();
    const source = (await provider.get("data", builder.build())).stack;
    const result = loadGetterTuplePoolData(source);
    return result;
  }
};

// src/curveConfig.js
var \u041C\u0410\u0421\u0428\u0422\u0410\u0411_\u041A\u0420\u0418\u0412\u041E\u0419 = 1;
var CURVE_PARAMS = {
  virtualTon: toNano((529.38 * \u041C\u0410\u0421\u0428\u0422\u0410\u0411_\u041A\u0420\u0418\u0412\u041E\u0419).toFixed(4)),
  virtualTokens: toNano("1073000000"),
  tokensForSale: toNano("800000000"),
  graduationTon: toNano((1500 * \u041C\u0410\u0421\u0428\u0422\u0410\u0411_\u041A\u0420\u0418\u0412\u041E\u0419).toFixed(2)),
  // Один процент с сделки — столько же берёт pump.fun. В резерв кривой
  // комиссия не попадает, уходит на кошелёк площадки, поэтому цену не
  // искажает. У токенов, запущенных при другой настройке, останется их
  // ставка: параметры зашиты в контракт навсегда, и предпросчёт берёт
  // feeBps из состояния конкретной кривой, а не отсюда.
  /* В тестовой сети комиссии нет вовсе: там торгуют игрушечными
     монетами, и удерживать с них процент незачем — он только мешает
     сверять расчёты. Ставка зашита в контракт при создании, так что на
     уже запущенных токенах это ничего не меняет. */
  // Комиссии площадки нет и в боевой сети: 0% — часть предложения Mintly.
  feeBps: 0n
};
var CURVE_TOTAL_SUPPLY = toNano("1000000000");
var CURVE_GAS_BUY_OVERHEAD = toNano("0.12");
var CURVE_SELL_FORWARD_TON = toNano("0.08");
var CURVE_SELL_VALUE = toNano("0.2");
async function curveContract({ admin, jettonMaster, feeWallet, graduationDestination }) {
  return await BondingCurve.fromInit(
    typeof admin === "string" ? Address3.parse(admin) : admin,
    typeof jettonMaster === "string" ? Address3.parse(jettonMaster) : jettonMaster,
    typeof feeWallet === "string" ? Address3.parse(feeWallet) : feeWallet,
    typeof graduationDestination === "string" ? Address3.parse(graduationDestination) : graduationDestination,
    CURVE_PARAMS.virtualTon,
    CURVE_PARAMS.virtualTokens,
    CURVE_PARAMS.tokensForSale,
    CURVE_PARAMS.graduationTon,
    CURVE_PARAMS.feeBps
  );
}
function buildBuyBody({ queryId = 0n, minTokensOut = 0n } = {}) {
  const builder = beginCell3();
  storeBuy({ $$type: "Buy", queryId, minTokensOut })(builder);
  return builder.endCell();
}
function buildSetJettonWalletBody(wallet) {
  const builder = beginCell3();
  storeSetJettonWallet({
    $$type: "SetJettonWallet",
    wallet: typeof wallet === "string" ? Address3.parse(wallet) : wallet
  })(builder);
  return builder.endCell();
}
var POOL_GAS_BUY_OVERHEAD = toNano("0.12");
var POOL_SELL_FORWARD_TON = toNano("0.08");
var POOL_SELL_VALUE = toNano("0.2");
async function poolContract({ admin, jettonMaster, feeWallet }) {
  return await LiquidityPool.fromInit(
    typeof admin === "string" ? Address3.parse(admin) : admin,
    typeof jettonMaster === "string" ? Address3.parse(jettonMaster) : jettonMaster,
    typeof feeWallet === "string" ? Address3.parse(feeWallet) : feeWallet,
    CURVE_PARAMS.feeBps
  );
}
function buildSetCurveBody(curve) {
  const builder = beginCell3();
  storeSetCurve({
    $$type: "SetCurve",
    curve: typeof curve === "string" ? Address3.parse(curve) : curve
  })(builder);
  return builder.endCell();
}

// src/tonLaunchCore.js
var \u0410\u0414\u0420\u0415\u0421_\u041A\u041E\u041C\u0418\u0421\u0421\u0418\u0418 = "0QClGN5huzz-Z3bwgxr7GOPe5Jyi8PNKbsNnDFKFNGbjunBZ";
function \u043A\u043E\u043F\u0438\u043B\u043A\u0430(\u0430\u0434\u0440\u0435\u0441, \u0441\u043F\u0438\u0441\u043E\u043A) {
  return { address: \u0430\u0434\u0440\u0435\u0441, async send(args) {
    \u0441\u043F\u0438\u0441\u043E\u043A.push(args);
  } };
}
function \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u041D\u043E\u0432\u043E\u0433\u043E(\u043A\u043E\u043D\u0442\u0440\u0430\u043A\u0442) {
  return {
    async internal(via, m) {
      await via.send({
        to: \u043A\u043E\u043D\u0442\u0440\u0430\u043A\u0442.address,
        value: m.value,
        bounce: m.bounce ?? true,
        sendMode: m.sendMode,
        init: \u043A\u043E\u043D\u0442\u0440\u0430\u043A\u0442.init,
        body: m.body
      });
    }
  };
}
async function \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F\u0417\u0430\u043F\u0443\u0441\u043A\u0430({ admin, metadataUrl, buyTon = 0, feeAddress = \u0410\u0414\u0420\u0415\u0421_\u041A\u041E\u041C\u0418\u0421\u0421\u0418\u0418, \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C = null }) {
  const \u0430\u0434\u043C = typeof admin === "string" ? Address4.parse(admin) : admin;
  const \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F = typeof feeAddress === "string" ? Address4.parse(feeAddress) : feeAddress;
  const \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 = beginCell4().storeUint(1, 8).storeStringTail(metadataUrl).endCell();
  const \u043F\u0435\u0440\u0432\u044B\u0439 = [];
  const \u043E\u0442\u043F\u0440 = \u043A\u043E\u043F\u0438\u043B\u043A\u0430(\u0430\u0434\u043C, \u043F\u0435\u0440\u0432\u044B\u0439);
  const \u043C\u0438\u043D\u0442\u0435\u0440 = JettonMinter.createFromConfig({ admin: \u0430\u0434\u043C, content: \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 });
  const \u0436\u0435\u0442\u043E\u043D = \u043C\u0438\u043D\u0442\u0435\u0440.address;
  const \u043F\u0443\u043B = \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C ? null : await poolContract({ admin: \u0430\u0434\u043C, jettonMaster: \u0436\u0435\u0442\u043E\u043D, feeWallet: \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F });
  const \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C = \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C ? typeof \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C === "string" ? Address4.parse(\u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C) : \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C : \u043F\u0443\u043B.address;
  const \u043A\u0440\u0438\u0432\u0430\u044F = await curveContract({ admin: \u0430\u0434\u043C, jettonMaster: \u0436\u0435\u0442\u043E\u043D, feeWallet: \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F, graduationDestination: \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C });
  await \u043C\u0438\u043D\u0442\u0435\u0440.sendMint(\u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u041D\u043E\u0432\u043E\u0433\u043E(\u043C\u0438\u043D\u0442\u0435\u0440), \u043E\u0442\u043F\u0440, \u043A\u0440\u0438\u0432\u0430\u044F.address, CURVE_TOTAL_SUPPLY, { value: toNano2("0.1") });
  const \u043A\u043E\u0448\u0435\u043B\u0451\u043A\u041A\u0440\u0438\u0432\u043E\u0439 = JettonWallet.createFromConfig({ owner: \u043A\u0440\u0438\u0432\u0430\u044F.address, jettonMaster: \u0436\u0435\u0442\u043E\u043D }).address;
  \u043F\u0435\u0440\u0432\u044B\u0439.push({ to: \u043A\u0440\u0438\u0432\u0430\u044F.address, value: toNano2("0.05"), init: \u043A\u0440\u0438\u0432\u0430\u044F.init, body: buildSetJettonWalletBody(\u043A\u043E\u0448\u0435\u043B\u0451\u043A\u041A\u0440\u0438\u0432\u043E\u0439), bounce: false });
  if (\u043F\u0443\u043B) {
    const \u043A\u043E\u0448\u0435\u043B\u0451\u043A\u041F\u0443\u043B\u0430 = JettonWallet.createFromConfig({ owner: \u043F\u0443\u043B.address, jettonMaster: \u0436\u0435\u0442\u043E\u043D }).address;
    \u043F\u0435\u0440\u0432\u044B\u0439.push({ to: \u043F\u0443\u043B.address, value: toNano2("0.06"), init: \u043F\u0443\u043B.init, body: buildSetJettonWalletBody(\u043A\u043E\u0448\u0435\u043B\u0451\u043A\u041F\u0443\u043B\u0430), bounce: false });
    \u043F\u0435\u0440\u0432\u044B\u0439.push({ to: \u043F\u0443\u043B.address, value: toNano2("0.03"), init: \u043F\u0443\u043B.init, body: buildSetCurveBody(\u043A\u0440\u0438\u0432\u0430\u044F.address), bounce: false });
  }
  const \u0432\u0442\u043E\u0440\u043E\u0439 = [];
  const \u043E\u0442\u043A\u0430\u0437 = [];
  await \u043C\u0438\u043D\u0442\u0435\u0440.sendChangeAdmin(\u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u041D\u043E\u0432\u043E\u0433\u043E(\u043C\u0438\u043D\u0442\u0435\u0440), \u043A\u043E\u043F\u0438\u043B\u043A\u0430(\u0430\u0434\u043C, \u043E\u0442\u043A\u0430\u0437), null, { value: toNano2("0.05") });
  if (\u043F\u0435\u0440\u0432\u044B\u0439.length < 4) \u043F\u0435\u0440\u0432\u044B\u0439.push(...\u043E\u0442\u043A\u0430\u0437);
  else \u0432\u0442\u043E\u0440\u043E\u0439.push(...\u043E\u0442\u043A\u0430\u0437);
  const \u043F\u043E\u043A\u0443\u043F\u043A\u0430 = Math.max(0, Number(buyTon) || 0);
  if (\u043F\u043E\u043A\u0443\u043F\u043A\u0430 > 0) {
    \u0432\u0442\u043E\u0440\u043E\u0439.push({
      to: \u043A\u0440\u0438\u0432\u0430\u044F.address,
      value: toNano2(\u043F\u043E\u043A\u0443\u043F\u043A\u0430.toFixed(9)) + CURVE_GAS_BUY_OVERHEAD,
      body: buildBuyBody({ queryId: 0n, minTokensOut: 0n }),
      bounce: true
    });
  }
  return {
    \u043F\u0430\u043A\u0435\u0442\u044B: [\u043F\u0435\u0440\u0432\u044B\u0439, \u0432\u0442\u043E\u0440\u043E\u0439].filter((\u043F) => \u043F.length),
    \u043E\u0442\u043A\u0430\u0437\u041E\u0442\u0412\u044B\u043F\u0443\u0441\u043A\u0430: true,
    \u0430\u0434\u0440\u0435\u0441\u0430: {
      jettonMaster: \u0436\u0435\u0442\u043E\u043D.toString(),
      curve: \u043A\u0440\u0438\u0432\u0430\u044F.address.toString(),
      curveJettonWallet: \u043A\u043E\u0448\u0435\u043B\u0451\u043A\u041A\u0440\u0438\u0432\u043E\u0439.toString(),
      pool: \u043F\u0443\u043B ? \u043F\u0443\u043B.address.toString() : null
    }
  };
}
async function \u0430\u0434\u0440\u0435\u0441\u0430\u041A\u0440\u0438\u0432\u043E\u0439\u041F\u043B\u043E\u0449\u0430\u0434\u043A\u0438({ admin, jettonMaster, \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C = null }) {
  const \u0430\u0434\u043C = typeof admin === "string" ? Address4.parse(admin) : admin;
  const \u0436\u0435\u0442\u043E\u043D = typeof jettonMaster === "string" ? Address4.parse(jettonMaster) : jettonMaster;
  const \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F = Address4.parse(\u0410\u0414\u0420\u0415\u0421_\u041A\u041E\u041C\u0418\u0421\u0421\u0418\u0418);
  const \u0430\u0434\u0440\u0435\u0441\u0430 = [];
  if (\u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C) {
    const \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C = typeof \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C === "string" ? Address4.parse(\u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C) : \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C;
    \u0430\u0434\u0440\u0435\u0441\u0430.push((await curveContract({ admin: \u0430\u0434\u043C, jettonMaster: \u0436\u0435\u0442\u043E\u043D, feeWallet: \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F, graduationDestination: \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C })).address);
  }
  const \u043F\u0443\u043B = await poolContract({ admin: \u0430\u0434\u043C, jettonMaster: \u0436\u0435\u0442\u043E\u043D, feeWallet: \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F });
  \u0430\u0434\u0440\u0435\u0441\u0430.push((await curveContract({ admin: \u0430\u0434\u043C, jettonMaster: \u0436\u0435\u0442\u043E\u043D, feeWallet: \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F, graduationDestination: \u043F\u0443\u043B.address })).address);
  return \u0430\u0434\u0440\u0435\u0441\u0430.map((\u0430) => \u0430.toRawString());
}
async function \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u041E\u0442\u043A\u0430\u0437\u0430({ admin, jettonMaster }) {
  const \u0430\u0434\u043C = typeof admin === "string" ? Address4.parse(admin) : admin;
  const \u0436\u0435\u0442\u043E\u043D = typeof jettonMaster === "string" ? Address4.parse(jettonMaster) : jettonMaster;
  const \u0441\u043F\u0438\u0441\u043E\u043A = [];
  const \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 = {
    async internal(via, m) {
      await via.send({ to: \u0436\u0435\u0442\u043E\u043D, value: m.value, bounce: m.bounce ?? true, sendMode: m.sendMode, body: m.body });
    }
  };
  await JettonMinter.createFromAddress(\u0436\u0435\u0442\u043E\u043D).sendChangeAdmin(\u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440, \u043A\u043E\u043F\u0438\u043B\u043A\u0430(\u0430\u0434\u043C, \u0441\u043F\u0438\u0441\u043E\u043A), null, { value: toNano2("0.03") });
  return \u0441\u043F\u0438\u0441\u043E\u043A[0];
}
function \u043A\u043E\u0448\u0435\u043B\u0451\u043A\u0416\u0435\u0442\u043E\u043D\u0430\u041A\u0440\u0438\u0432\u043E\u0439({ curve, jettonMaster }) {
  const \u043A\u0440\u0438\u0432\u0430\u044F = typeof curve === "string" ? Address4.parse(curve) : curve;
  const \u0436\u0435\u0442\u043E\u043D = typeof jettonMaster === "string" ? Address4.parse(jettonMaster) : jettonMaster;
  return JettonWallet.createFromConfig({ owner: \u043A\u0440\u0438\u0432\u0430\u044F, jettonMaster: \u0436\u0435\u0442\u043E\u043D }).address.toRawString();
}
function \u043E\u0442\u043F\u0435\u0447\u0430\u0442\u043E\u043A\u041C\u0438\u043D\u0442\u0435\u0440\u0430() {
  return JettonMinter.createFromConfig({ admin: Address4.parse(\u0410\u0414\u0420\u0415\u0421_\u041A\u041E\u041C\u0418\u0421\u0421\u0418\u0418), content: beginCell4().endCell() }).init.code.hash().toString("hex");
}
export {
  \u0410\u0414\u0420\u0415\u0421_\u041A\u041E\u041C\u0418\u0421\u0421\u0418\u0418,
  \u0430\u0434\u0440\u0435\u0441\u0430\u041A\u0440\u0438\u0432\u043E\u0439\u041F\u043B\u043E\u0449\u0430\u0434\u043A\u0438,
  \u043A\u043E\u0448\u0435\u043B\u0451\u043A\u0416\u0435\u0442\u043E\u043D\u0430\u041A\u0440\u0438\u0432\u043E\u0439,
  \u043E\u0442\u043F\u0435\u0447\u0430\u0442\u043E\u043A\u041C\u0438\u043D\u0442\u0435\u0440\u0430,
  \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u041E\u0442\u043A\u0430\u0437\u0430,
  \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F\u0417\u0430\u043F\u0443\u0441\u043A\u0430
};
