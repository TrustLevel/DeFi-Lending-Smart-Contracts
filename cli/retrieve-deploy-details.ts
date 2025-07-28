// *************************************************************************
// *     RETRIEVE DETAILS OF ALREADY DEPLOYED CONTRACTS AND BEACONS      *
//
// in `deployDetailsFile`, only the following items should be filled in:
// - refscriptsScriptAddr
// *************************************************************************

import { 
    UTxO,
    Data,
    Script,
    stringify,
    Credential,
    getAddressDetails,
    validatorToAddress,
    validatorToScriptHash,
    validatorToRewardAddress,
    credentialToRewardAddress,
} from "@lucid-evolution/lucid";
import { 
    bcnTknsHex,
    provNetwork,
    tusdDeployed,
    deployDetailsFile, 
    getLucidInstance,
    refscriptsBcnTokens,
    LendingPoolDatum,
    OracleDatum,
    SettingsEnum,
    SettingsDatum,
    GlobalSettingsType,
} from "../index.ts";

const lucid = getLucidInstance();
const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);
const { refscriptsScriptAddr } = deployed;

const refUtxos = await lucid.utxosAt(refscriptsScriptAddr);

const refscriptsAddrDetails = getAddressDetails(refscriptsScriptAddr);
const refscriptsCred = refscriptsAddrDetails.paymentCredential as Credential;
const refscriptsRewardAddr = credentialToRewardAddress(provNetwork, refscriptsCred);

const refscriptsScriptRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.refscripts]) return true;
    else return false;
})!;

const settingsScriptRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.settings]) return true;
    else return false;
})!;

const oracleScriptRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.oracle]) return true;
    else return false;
})!;

const registryScriptRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.registry]) return true;
    else return false;
})!;

const collateralScriptRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.collateral]) return true;
    else return false;
})!;

const auditScriptRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.audit]) return true;
    else return false;
})!;

const poolScriptRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.lendingPool]) return true;
    else return false;
})!;

const settingsScript = settingsScriptRefUtxo.scriptRef as Script;
const settingsScriptHash = validatorToScriptHash(settingsScript);
const settingsPolicyID = settingsScriptHash;
const settingsScriptAddr = validatorToAddress(provNetwork, settingsScript, refscriptsCred);
const settingsRewardAddr = validatorToRewardAddress(provNetwork, settingsScript);
const settingsBcnTokens = bcnTknsHex;

const poolScript = poolScriptRefUtxo.scriptRef as Script;
const poolScriptHash = validatorToScriptHash(poolScript);
const posTokensPolicyId = poolScriptHash;
const lendingPoolScriptAddr = validatorToAddress(provNetwork, poolScript, refscriptsCred);

const collateralScript = collateralScriptRefUtxo.scriptRef as Script;
const collateralScriptHash = validatorToScriptHash(collateralScript);
const collateralScriptAddr = validatorToAddress(provNetwork, collateralScript, refscriptsCred);

const oracleScript = oracleScriptRefUtxo.scriptRef as Script;
const oracleScriptHash = validatorToScriptHash(oracleScript);
const oraclePolicyID = oracleScriptHash;
const oracleScriptAddr = validatorToAddress(provNetwork, oracleScript, refscriptsCred);

const registryScript = registryScriptRefUtxo.scriptRef as Script;
const registryScriptAddr = validatorToAddress(provNetwork, registryScript, refscriptsCred);

const auditScript = auditScriptRefUtxo.scriptRef as Script;
const auditScriptAddr = validatorToAddress(provNetwork, auditScript, refscriptsCred);

const settingsUtxos = await lucid.utxosAt(settingsScriptAddr);
const globalCfgUtxo = settingsUtxos.find((utxo) => {
    if (utxo.assets[settingsPolicyID + bcnTknsHex.globalCfg]) return true;
    else return false;
}) as UTxO;
const oracleCfgUtxo = settingsUtxos.find((utxo) => {
    if (utxo.assets[settingsPolicyID + bcnTknsHex.oracleCfg]) return true;
    else return false;
}) as UTxO;
// const globalCfgDatum = (Data.from(globalCfgUtxo.datum!, SettingsDatum) as {[SettingsEnum.GlobalSettings]: GlobalSettingsType})[SettingsEnum.GlobalSettings];

const oracleUtxos = await lucid.utxosAt(oracleScriptAddr);
const oraclePriceUtxo = oracleUtxos.find((utxo) => {
    if (utxo.assets[oraclePolicyID + bcnTknsHex.oraclePrice]) return true;
    else return false;
}) as UTxO;
// const oracleDatum = Data.from(oraclePriceUtxo.datum!, OracleDatum);


const collateralUtxos = await lucid.utxosAt(collateralScriptAddr);
console.log(`collateralUtxos: ${collateralUtxos.length}`);

const registryUtxos = await lucid.utxosAt(registryScriptAddr);


const poolUtxos = await lucid.utxosAt(lendingPoolScriptAddr);
const poolUtxo = poolUtxos.find((utxo) => {
    if (utxo.assets[tusdDeployed.policy_id + tusdDeployed.asset_name]) return true;
    else return false;
}) as UTxO;
const poolDatum = Data.from(poolUtxo.datum!, LendingPoolDatum);


const auditUtxos = await lucid.utxosAt(auditScriptAddr);
const auditUtxo = auditUtxos.find((utxo) => {
    if (utxo.assets[settingsPolicyID + bcnTknsHex.audit]) return true;
    else return false;
})

deployed.refscriptsRewardAddr = refscriptsRewardAddr;
deployed.settingsScriptAddr = settingsScriptAddr;
deployed.settingsRewardAddr = settingsRewardAddr;
deployed.settingsPolicyID = settingsPolicyID;

deployed.lendingPoolScriptAddr = lendingPoolScriptAddr;
deployed.posTokensPolicyId = posTokensPolicyId;

deployed.collateralScriptAddr = collateralScriptAddr;
deployed.collateralScriptHash = collateralScriptHash;
deployed.oracleScriptAddr = oracleScriptAddr;
deployed.oraclePolicyID = oraclePolicyID;
deployed.registryScriptAddr = registryScriptAddr;
deployed.auditScriptAddr = auditScriptAddr;

deployed.settingsBcnTokens = settingsBcnTokens;
deployed.refscriptsBcnTokens = refscriptsBcnTokens;
deployed.collateralAsset = poolDatum.collateral_asset;
deployed.loanableAsset = poolDatum.loanable_asset;

deployed.auditUtxo = auditUtxo;
deployed.cfgUtxos = {
    globalCfgUtxo: globalCfgUtxo,
    oracleCfgUtxo: oracleCfgUtxo,
}

deployed.referenceUtxos = {
    refscripts: refscriptsScriptRefUtxo,
    settings: settingsScriptRefUtxo,
    oracle: oracleScriptRefUtxo,
    registry: registryScriptRefUtxo,
    collateral: collateralScriptRefUtxo,
    audit: auditScriptRefUtxo,
    lendingPool: poolScriptRefUtxo,
};

deployed.oraclePriceUtxo = oraclePriceUtxo;
deployed.oraclePriceBcnToken = oraclePolicyID + bcnTknsHex.oraclePrice;

deployed.poolUtxo = poolUtxo;

deployed.collateralUtxos = collateralUtxos;

deployed.registryUtxos = registryUtxos;


// write to file
const data = new TextEncoder().encode(stringify(deployed));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");
