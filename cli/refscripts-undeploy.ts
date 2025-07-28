import {
    Data,
    Script, 
    stringify,
    RedeemerBuilder,
} from "@lucid-evolution/lucid";
import {
    adminMintingScript,
    adminPkh,
    deployDetailsFile,
    getLucidInstance,
    refscriptsScriptHash,
    RedeemerEnum,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    getDeployedRefUtxos,
    parseStringifiedUtxo,
    orderUtxosCanonically,
} from "../index.ts";

const dryRun = Deno.args[0] == "dryrun";

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const refscriptsAddr = deployed.refscriptsScriptAddr;
const refscriptsRewardAddr = deployed.refscriptsRewardAddr;

const oracleScriptAddr = deployed.oracleScriptAddr;
const oraclePolicyID = deployed.oraclePolicyID;

const lucid = getLucidInstance();

// const refUtxos = await lucid.utxosAt(refscriptsAddr);
const refUtxos = getDeployedRefUtxos(Object.values(deployed.referenceUtxos));

const oracleRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.oracle]) return true;
    else return false;
})!;

// MARK: TX 1

/**
 * Tx 1: Burn the oracle price beacon token and remove the oracle utxo.
 *
 * This needs to be done before removing the reference utxos from the refscripts contract
 * so that the oracle reference script can still be used.
 */
const globalCfgUtxo = parseStringifiedUtxo(deployed.cfgUtxos.globalCfgUtxo);
const oracleUtxos = await (async () => {
    const liveUtxos = await lucid.utxosAt(oracleScriptAddr);
    return liveUtxos.length > 0 
        ? liveUtxos 
        : [parseStringifiedUtxo(deployed.oraclePriceUtxo)];
})();
const oracleBcnsToBurn = oracleUtxos.reduce((accum: { [asset: string]: bigint }, utxo) => {
    for (const [token, _amt] of Object.entries(utxo.assets)) {
        if (token.startsWith(oraclePolicyID)) {
            accum[token] = -1n;
        }
    }
    return accum;
}, {});

const referenceInputs1 = [oracleRefUtxo, globalCfgUtxo];
const refInputs1Idxs = orderUtxosCanonically(referenceInputs1);
const cfg_idx1 = refInputs1Idxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;
const oracleBcnBurnObj: UnifiedRedeemerType = {
    [RedeemerEnum.BurnOracleBeacon]: {
        cfg_idx: cfg_idx1
    }
};
const oracleBcnBurnRedeemer = Data.to(oracleBcnBurnObj, UnifiedRedeemer);
const [newWalletInputs1, _derivedOutputs1, tx1] = await lucid
    .newTx()
    .mintAssets(oracleBcnsToBurn, oracleBcnBurnRedeemer)
    .collectFrom(oracleUtxos, oracleBcnBurnRedeemer)
    .readFrom(referenceInputs1)
    .addSignerKey(adminPkh)
    .chain();
console.log(`Oracle beacon tokens burn tx built`);
console.log("");
const signedTx1 = await tx1.sign.withWallet().complete();
console.log(`signedTx1: ${stringify(signedTx1)}`);
console.log(`signedTx1 hash: ${signedTx1.toHash()}`);
console.log(`size: ~${signedTx1.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const tx1Json = JSON.parse(stringify(signedTx1));
console.log(`tx1Fee: ${parseInt(tx1Json.body.fee) / 1_000_000} ADA`);
console.log("");
if (!dryRun){
    const tx1Hash = await signedTx1.submit();
    console.log(`tx1 submitted. Hash: ${tx1Hash}`);
}
console.log("");



// MARK: TX 2

/**
 * Tx 2: Burn the audit and oracle cfg beacon tokens.
 */
lucid.overrideUTxOs(newWalletInputs1);

const settingsRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.settings]) return true;
    else return false;
})!;
const auditRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.audit]) return true;
    else return false;
})!;
const oracleCfgUtxo = parseStringifiedUtxo(deployed.cfgUtxos.oracleCfgUtxo);
const auditUtxo = parseStringifiedUtxo(deployed.auditUtxo);
const cfgBcnsToBurn = {
    [deployed.settingsPolicyID + deployed.settingsBcnTokens.globalCfg]: -1n,
    [deployed.settingsPolicyID + deployed.settingsBcnTokens.oracleCfg]: -1n,
    [deployed.settingsPolicyID + deployed.settingsBcnTokens.audit]: -1n,
}
const bcnsBurnRedeemer_mint: RedeemerBuilder = {
    kind: "selected",
    inputs: [globalCfgUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.BurnSettingsBeacons]: {
                glob_cfg_utxo_idx: inputIdxs[0],
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};
const bcnsBurnRedeemer_spend: RedeemerBuilder = {
    kind: "selected",
    inputs: [globalCfgUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.BurnSettingsBeacons]: {
                glob_cfg_utxo_idx: inputIdxs[0],
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};
const bcnsBurnRedeemer_withdraw: RedeemerBuilder = {
    kind: "selected",
    inputs: [globalCfgUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.BurnSettingsBeacons]: {
                glob_cfg_utxo_idx: inputIdxs[0],
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};
const redeemer_publish: UnifiedRedeemerType = {
    [RedeemerEnum.BurnSettingsBeacons]: {
        glob_cfg_utxo_idx: 0n, // dummy only, since lucid-evo hasn't implemented yet the RedeemerBuilder for the `publish` script purpose
    },
};
const bcnsBurnRedeemer_publish = Data.to(redeemer_publish, UnifiedRedeemer);

const [newWalletInputs2, _derivedOutputs2, tx2] = await lucid
    .newTx()
    .mintAssets(cfgBcnsToBurn, bcnsBurnRedeemer_mint)
    .collectFrom([globalCfgUtxo, oracleCfgUtxo, auditUtxo], bcnsBurnRedeemer_spend)
    .deregister.Stake(deployed.settingsRewardAddr, bcnsBurnRedeemer_publish)
    .withdraw(deployed.settingsRewardAddr, 0n, bcnsBurnRedeemer_withdraw)
    .readFrom([settingsRefUtxo, auditRefUtxo])
    .addSignerKey(adminPkh)
    .chain();
const signedTx2 = await tx2.sign.withWallet().complete();
console.log(`signedTx2: ${stringify(signedTx2)}`);
console.log(`signedTx2 hash: ${signedTx2.toHash()}`);
console.log(`size: ~${signedTx2.toCBOR().length / 2048} KB`);
console.log("");
const tx2Json = JSON.parse(stringify(signedTx2));
console.log(`tx2Fee: ${parseInt(tx2Json.body.fee) / 1_000_000} ADA`);
console.log("");
if (!dryRun){
    const tx2Hash = await signedTx2.submit();
    console.log(`tx2 submitted. Hash: ${tx2Hash}`);
}
console.log("");



// MARK: TX 3

/**
 * Tx 3: Undeploy refscripts - burn the refscripts beacon tokens, remove the refscripts utxos,
 * and de-register the stake accts for `refscripts` and `oracle` contracts.
 */
lucid.overrideUTxOs(newWalletInputs2);

const refscriptsRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.refscripts]) return true;
    else return false;
})!;
const refScript = refscriptsRefUtxo.scriptRef as Script;

console.log(`refscriptsAddr: ${refscriptsAddr}`);
console.log(`refscriptsRewardAddr: ${refscriptsRewardAddr}`);
console.log(`refscriptsScriptHash: ${refscriptsScriptHash}`);
console.log("");
console.log(`refUtxos count: ${refUtxos.length}`);
console.log("");

const refscriptBcnsToBurn = refUtxos.reduce((accum: { [asset: string]: bigint }, utxo) => {
    for (const [token, _amt] of Object.entries(utxo.assets)) {
        if (token.startsWith(deployed.adminTokensPolicyId)) {
            accum[token] = -1n;
        }
    }
    return accum;
}, {});
const tx3 = await lucid
    .newTx()
    .mintAssets(refscriptBcnsToBurn)
    .collectFrom(refUtxos, Data.void())
    .deregister.Stake(refscriptsRewardAddr, Data.void())
    .withdraw(refscriptsRewardAddr, 0n, Data.void())
    .addSignerKey(adminPkh)
    .attach.Script(refScript)
    .attach.Script(adminMintingScript)
    .complete();
const signedTx3 = await tx3.sign.withWallet().complete();
console.log(`signedTx3: ${stringify(signedTx3)}`);
console.log(`signedTx3 hash: ${signedTx3.toHash()}`);
console.log(`size: ~${signedTx3.toCBOR().length / 2048} KB`);
console.log("");
const tx3Json = JSON.parse(stringify(signedTx3));
console.log(`tx3Fee: ${parseInt(tx3Json.body.fee) / 1_000_000} ADA`);
console.log("");
if (!dryRun){
    const tx3Hash = await signedTx3.submit();
    console.log(`tx3 submitted. Hash: ${tx3Hash}`);
}
console.log("");
