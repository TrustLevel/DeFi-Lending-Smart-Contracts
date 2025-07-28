import { 
    Data,
    UTxO,
    Assets,
    stringify,
    RedeemerBuilder,
} from "@lucid-evolution/lucid";
import {
    adaAssetClass,
    adminMintingScript,
    adminPkh,
    adminTokensPolicyId,
    collateralScript,
    collateralScriptHash,
    collateralScriptAddr,
    collateralRatio,
    deployDetailsFile,
    getLucidInstance,
    lendingPoolPolicyID,
    lendingPoolScript,
    lendingPoolScriptHash,
    lendingPoolScriptAddr,
    settingsInitUtxo,
    oraclePolicyID,
    oracleScript,
    oracleScriptHash,
    oracleScriptAddr,
    OracleDatumType,
    makeOracleDatum,
    getUpdatedPrice,
    ORACLE_DATA_VALIDITY,
    bcnTknsHex,
    provider1PaymentHash,
    RedeemerEnum,
    refscriptsBcnTokens,
    refscriptsRewardAddr,
    refscriptsScript,
    refscriptsScriptAddr,
    registryScript,
    registryScriptAddr,
    sleep,
    tusdDeployed,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    settingsScript,
    settingsPolicyID,
    settingsScriptAddr,
    settingsRewardAddr,
    SettingsDatumType,
    SettingsEnum,
    makeSettingsDatum,
    registryScriptHash,
    maxTxValidity,
    supportedDexes,
    auditScript,
    auditScriptHash,
    auditScriptAddr,
    AuditDatumType,
    makeAuditDatum,
    orderUtxosCanonically
} from "../index.ts";

const lucid = getLucidInstance();

/**
 * Time to wait before retrying submission of a failed tx.
 *
 * Applies when a chained tx is rejected for consuming output(s) from the previous tx that
 * is not yet visible in the ledger/mempool.
 */
const retry_mins = 1;

const dryRun = Deno.args[0] == "dryrun";

// MARK: TX 1

/**
 * Tx 1: Mint the settings beacon tokens and initialize the settings utxos.
 *
 * This needs to be done foremost, since the settings contract is parameterized with a utxo taken
 * from the admin wallet account. This "initial utxo" is required by the minting policy for the
 * *settings* beacon tokens. If this initial utxo is spent by another tx, then this settings
 * beacon token will never be minted.
 */
const globalCfgBcnToken = settingsPolicyID + bcnTknsHex.globalCfg;
const oracleCfgBcnToken = settingsPolicyID + bcnTknsHex.oracleCfg;
const auditBcnToken = settingsPolicyID + bcnTknsHex.audit;
const cfgBeaconsMint: Assets = {
    [globalCfgBcnToken]: 1n,
    [oracleCfgBcnToken]: 1n,
    [auditBcnToken]: 1n,
};
const cfgBcnsMintRedeemer: RedeemerBuilder = {
    kind: "selected",
    inputs: [settingsInitUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.MintSettingsBeacons]: {
                init_utxo_idx: inputIdxs[0],
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};

const globaSettings: SettingsDatumType = {
    [SettingsEnum.GlobalSettings]: {
        admin_key_hash: adminPkh,
        pool_contract: lendingPoolScriptHash,
        audit_contract: auditScriptHash,
        oracle_contract: oracleScriptHash,
        registry_contract: registryScriptHash,
        collateral_contract: collateralScriptHash,
        collateral_ratio: collateralRatio,
        max_tx_validity: maxTxValidity,
        liquidation_dexes: supportedDexes
    }
}
const globalCfgDatum = makeSettingsDatum(globaSettings);

const oracleSettings: SettingsDatumType = {
    [SettingsEnum.OracleSettings]: {
        oracle_contract: oracleScriptHash,
        providers: [provider1PaymentHash, adminPkh],
    }
}
const oracleCfgDatum = makeSettingsDatum(oracleSettings);

const initAudit: AuditDatumType = {
    timestamp: 0n,
    collateral_asset: adaAssetClass,
    loanable_asset: tusdDeployed,
    collateral_ratio: collateralRatio,
    total_collateral: 0n,
    total_borrowed: 0n,
    health_score: [0n, 0n],
    utilization_rate: [0n, 0n],
}
const initAuditDatum = makeAuditDatum(initAudit);

const [newWalletInputs1, derivedOutputs1, tx1] = await lucid
    .newTx()
    .mintAssets(cfgBeaconsMint, cfgBcnsMintRedeemer)
    .collectFrom([settingsInitUtxo])
    .register.Stake(settingsRewardAddr)
    .pay.ToContract(
        settingsScriptAddr,
        { kind: "inline", value: globalCfgDatum },
        {[globalCfgBcnToken]: 1n},
    )
    .pay.ToContract(
        settingsScriptAddr,
        { kind: "inline", value: oracleCfgDatum },
        {[oracleCfgBcnToken]: 1n},
    )
    .pay.ToContract(
        auditScriptAddr,
        { kind: "inline", value: initAuditDatum },
        {[auditBcnToken]: 1n},
    )
    .attach.Script(settingsScript)
    .chain();
console.log(`Protocol settings init tx built`);
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


// Store deployed details to file
// deno-lint-ignore no-explicit-any
const results: Record<string, any> = {
    adminTokensPolicyId,
    refscriptsScriptAddr,
    settingsScriptAddr,
    settingsRewardAddr,
    settingsPolicyID,
    lendingPoolScriptAddr,
    posTokensPolicyId: lendingPoolPolicyID,
    collateralScriptAddr,
    collateralScriptHash,
    oracleScriptAddr,
    oraclePolicyID,
    registryScriptAddr,
    auditScriptAddr,
    settingsBcnTokens: bcnTknsHex,
    refscriptsBcnTokens,
    collateralAsset: adaAssetClass,
    loanableAsset: tusdDeployed
};
const globalCfgUtxo: UTxO = derivedOutputs1.find((utxo) => {
    if (utxo.assets[globalCfgBcnToken]) return true;
    else return false;
}) as UTxO;
const oracleCfgUtxo: UTxO = derivedOutputs1.find((utxo) => {
    if (utxo.assets[oracleCfgBcnToken]) return true;
    else return false;  
}) as UTxO;
const auditUtxo: UTxO = derivedOutputs1.find((utxo) => {
    if (utxo.assets[auditBcnToken]) return true;
    else return false;  
}) as UTxO;
results.auditUtxo = auditUtxo;
results.cfgUtxos = {
    globalCfgUtxo,
    oracleCfgUtxo
}
let data = new TextEncoder().encode(stringify(results));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Details written to ${deployDetailsFile}`);
console.log("");



// MARK: TX 2

/**
 * (Tx 2) Batch 1: Deploy validator scripts for the `settings`, and `refscripts` as _reference scripts_ 
 * tagged with their corresponding newly-minted beacon tokens.
 *
 * Note: This deploy routine is broken into multiple txs to avoid hitting the transaction size limit.
 */
lucid.overrideUTxOs(newWalletInputs1);

const refscriptBcnsToMint1 = {
    [refscriptsBcnTokens.refscripts]: 1n,
    [refscriptsBcnTokens.settings]: 1n,
};

const [newWalletInputs2, derivedOutputs2, tx2] = await lucid
    .newTx()
    .mintAssets(refscriptBcnsToMint1)
    .register.Stake(refscriptsRewardAddr)
    .pay.ToContract(
        refscriptsScriptAddr,
        { kind: "inline", value: Data.void() },
        { [refscriptsBcnTokens.refscripts]: 1n },
        refscriptsScript,
    )
    .pay.ToContract(
        refscriptsScriptAddr,
        { kind: "inline", value: Data.void() },
        { [refscriptsBcnTokens.settings]: 1n },
        settingsScript,
    )
    .attach.Script(adminMintingScript)
    .addSignerKey(adminPkh)
    .chain();
console.log(`deploy refscripts tx (batch 1) built`);
console.log("");
const signedTx2 = await tx2.sign.withWallet().complete();
console.log(`signedTx2: ${stringify(signedTx2)}`);
console.log(`signedTx2 hash: ${signedTx2.toHash()}`);
console.log(`size: ~${signedTx2.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const tx2Json = JSON.parse(stringify(signedTx2));
console.log(`tx2Fee: ${parseInt(tx2Json.body.fee) / 1_000_000} ADA`);
console.log("");
try {
    if (!dryRun){
        const tx2Hash = await signedTx2.submit();
        console.log(`tx2 submitted. Hash: ${tx2Hash}`);
    }
    console.log("");
} catch (error) {
    if ((error as Error).message.includes("transaction contains unknown UTxO references as inputs")) {
        console.log(`tx2 consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
        console.log(`Will retry in ${retry_mins} mins. Don't terminate, please wait...`);
        await sleep(retry_mins * 60 * 1000);
        const tx2Hash = await signedTx2.submit();
        console.log("");
        console.log(`tx2 submitted. Hash: ${tx2Hash}`);
        console.log("");
    } else {
        throw error;
    }
}

// Update deployed details file
const refscriptsRefUtxo: UTxO = derivedOutputs2.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.refscripts]) return true;
    else return false;
}) as UTxO;
const settingsRefUtxo: UTxO = derivedOutputs2.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.settings]) return true;
    else return false;
}) as UTxO;
results.referenceUtxos = {
    refscripts: refscriptsRefUtxo,
    settings: settingsRefUtxo
};
results.refscriptsRewardAddr = refscriptsRewardAddr;
data = new TextEncoder().encode(stringify(results));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");





// MARK: TX 3

/**
 * (Tx 3) Batch 2: Deploy validator scripts for the `oracle`, and `position_registry` as 
 * _reference scripts_ tagged with their corresponding newly-minted beacon tokens.
 */
lucid.overrideUTxOs(newWalletInputs2);

const refscriptBcnsToMint2 = {
    [refscriptsBcnTokens.oracle]: 1n,
    [refscriptsBcnTokens.registry]: 1n,
};

const [newWalletInputs3, derivedOutputs3, tx3] = await lucid
    .newTx()
    .mintAssets(refscriptBcnsToMint2)
    .pay.ToContract(
        refscriptsScriptAddr,
        { kind: "inline", value: Data.void() },
        { [refscriptsBcnTokens.oracle]: 1n },
        oracleScript,
    )
    .pay.ToContract(
        refscriptsScriptAddr,
        { kind: "inline", value: Data.void() },
        { [refscriptsBcnTokens.registry]: 1n },
        registryScript,
    )
    .attach.Script(adminMintingScript)
    .addSignerKey(adminPkh)
    .chain();
console.log(`deploy refscripts tx (batch 2) built`);
console.log("");
const signedTx3 = await tx3.sign.withWallet().complete();
console.log(`signedTx3: ${stringify(signedTx3)}`);
console.log(`signedTx3 hash: ${signedTx3.toHash()}`);
console.log(`size: ~${signedTx3.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const tx3Json = JSON.parse(stringify(signedTx3));
console.log(`tx3Fee: ${parseInt(tx3Json.body.fee) / 1_000_000} ADA`);
console.log("");
try {
    if (!dryRun){
        const tx3Hash = await signedTx3.submit();
        console.log(`tx3 submitted. Hash: ${tx3Hash}`);
    }    
    console.log("");
} catch (error) {
    if ((error as Error).message.includes("transaction contains unknown UTxO references as inputs")) {
        console.log(`tx3 consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
        console.log(`Will retry in ${retry_mins} mins. Don't terminate, please wait...`);
        await sleep(retry_mins * 60 * 1000);
        const tx3Hash = await signedTx3.submit();
        console.log("");
        console.log(`tx3 submitted. Hash: ${tx3Hash}`);
        console.log("");
    } else {
        throw error;
    }
}

// Update deployed details file
const oracleValRefUtxo: UTxO = derivedOutputs3.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.oracle]) return true;
    else return false;
}) as UTxO;
const registryValRefUtxo: UTxO = derivedOutputs3.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.registry]) return true;
    else return false;
}) as UTxO;
results.referenceUtxos.oracle = oracleValRefUtxo;
results.referenceUtxos.registry = registryValRefUtxo;
data = new TextEncoder().encode(stringify(results));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");





// MARK: TX 4

/**
 * (Tx 4) Batch 3: Deploy `collateral` validator script as _reference script_ likewise
 * tagged with its corresponding newly-minted beacon token.
 */
lucid.overrideUTxOs(newWalletInputs3);

const refscriptBcnsToMint3 = {
    [refscriptsBcnTokens.collateral]: 1n,
};

const [newWalletInputs4, derivedOutputs4, tx4] = await lucid
    .newTx()
    .mintAssets(refscriptBcnsToMint3)
    .pay.ToContract(
        refscriptsScriptAddr,
        { kind: "inline", value: Data.void() },
        { [refscriptsBcnTokens.collateral]: 1n },
        collateralScript,
    )
    .attach.Script(adminMintingScript)
    .addSignerKey(adminPkh)
    .chain();
console.log(`deploy refscripts tx (batch 3) built`);
console.log("");
const signedTx4 = await tx4.sign.withWallet().complete();
console.log(`signedTx4: ${stringify(signedTx4)}`);
console.log(`signedTx4 hash: ${signedTx4.toHash()}`);
console.log(`size: ~${signedTx4.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const tx4Json = JSON.parse(stringify(signedTx4));
console.log(`tx4Fee: ${parseInt(tx4Json.body.fee) / 1_000_000} ADA`);
console.log("");
try {
    if (!dryRun){
        const tx4Hash = await signedTx4.submit();
        console.log(`tx4 submitted. Hash: ${tx4Hash}`);
    }    
    console.log("");
} catch (error) {
    if ((error as Error).message.includes("transaction contains unknown UTxO references as inputs")) {
        console.log(`tx4 consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
        console.log(`Will retry in ${retry_mins} mins. Don't terminate, please wait...`);
        await sleep(retry_mins * 60 * 1000);
        const tx4Hash = await signedTx4.submit();
        console.log("");
        console.log(`tx4 submitted. Hash: ${tx4Hash}`);
        console.log("");
    } else {
        throw error;
    }
}

// Update deployed details file
const collateralValRefUtxo: UTxO = derivedOutputs4.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.collateral]) return true;
    else return false;
}) as UTxO;
results.referenceUtxos.collateral = collateralValRefUtxo;
data = new TextEncoder().encode(stringify(results));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");




// MARK: TX 5

/**
 * (Tx 5) Batch 4: Deploy `audit` validator scripts as _reference script_ likewise
 * tagged with its corresponding newly-minted beacon token.
 */
lucid.overrideUTxOs(newWalletInputs4);

const refscriptBcnsToMint4 = {
    [refscriptsBcnTokens.audit]: 1n,
};

const [newWalletInputs5, derivedOutputs5, tx5] = await lucid
    .newTx()
    .mintAssets(refscriptBcnsToMint4)
    .pay.ToContract(
        refscriptsScriptAddr,
        { kind: "inline", value: Data.void() },
        { [refscriptsBcnTokens.audit]: 1n },
        auditScript,
    )
    .attach.Script(adminMintingScript)
    .addSignerKey(adminPkh)
    .chain();
console.log(`deploy refscripts tx (batch 4) built`);
console.log("");
const signedTx5 = await tx5.sign.withWallet().complete();
console.log(`signedTx5: ${stringify(signedTx5)}`);
console.log(`signedTx5 hash: ${signedTx5.toHash()}`);
console.log(`size: ~${signedTx5.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const tx5Json = JSON.parse(stringify(signedTx5));
console.log(`tx5Fee: ${parseInt(tx5Json.body.fee) / 1_000_000} ADA`);
console.log("");
try {
    if (!dryRun){
        const tx5Hash = await signedTx5.submit();
        console.log(`tx5 submitted. Hash: ${tx5Hash}`);
    }    
    console.log("");
} catch (error) {
    if ((error as Error).message.includes("transaction contains unknown UTxO references as inputs")) {
        console.log(`tx5 consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
        console.log(`Will retry in ${retry_mins} mins. Don't terminate, please wait...`);
        await sleep(retry_mins * 60 * 1000);
        const tx5Hash = await signedTx5.submit();
        console.log("");
        console.log(`tx5 submitted. Hash: ${tx5Hash}`);
        console.log("");
    } else {
        throw error;
    }
}

// Update deployed details file
const auditValRefUtxo: UTxO = derivedOutputs5.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.audit]) return true;
    else return false;
}) as UTxO;
results.referenceUtxos.audit = auditValRefUtxo;
data = new TextEncoder().encode(stringify(results));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");





// MARK: TX 6

/**
 * (Tx 6) Batch 5: Deploy validator script for the `lending_pool` as _reference script_ likewise
 * tagged with its corresponding newly-minted beacon token.
 */
lucid.overrideUTxOs(newWalletInputs5);

const refscriptBcnsToMint5 = {
    [refscriptsBcnTokens.lendingPool]: 1n,
};

const [newWalletInputs6, derivedOutputs6, tx6] = await lucid
    .newTx()
    .mintAssets(refscriptBcnsToMint5)
    .pay.ToContract(
        refscriptsScriptAddr,
        { kind: "inline", value: Data.void() },
        { [refscriptsBcnTokens.lendingPool]: 1n },
        lendingPoolScript,
    )
    .attach.Script(adminMintingScript)
    .addSignerKey(adminPkh)
    .chain();
console.log(`deploy refscripts tx (batch 5) built`);
console.log("");
const signedTx6 = await tx6.sign.withWallet().complete();
console.log(`signedTx6: ${stringify(signedTx6)}`);
console.log(`signedTx6 hash: ${signedTx6.toHash()}`);
console.log(`size: ~${signedTx6.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const tx6Json = JSON.parse(stringify(signedTx6));
console.log(`tx6Fee: ${parseInt(tx6Json.body.fee) / 1_000_000} ADA`);
console.log("");
try {
    if (!dryRun){
        const tx6Hash = await signedTx6.submit();
        console.log(`tx6 submitted. Hash: ${tx6Hash}`);
    }    
    console.log("");
} catch (error) {
    if ((error as Error).message.includes("transaction contains unknown UTxO references as inputs")) {
        console.log(`tx6 consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
        console.log(`Will retry in ${retry_mins} mins. Don't terminate, please wait...`);
        await sleep(retry_mins * 60 * 1000);
        const tx6Hash = await signedTx6.submit();
        console.log("");
        console.log(`tx6 submitted. Hash: ${tx6Hash}`);
        console.log("");
    } else {
        throw error;
    }
}

// Update deployed details file
const lendingPoolValRefUtxo: UTxO = derivedOutputs6.find((utxo) => {
    if (utxo.assets[refscriptsBcnTokens.lendingPool]) return true;
    else return false;
}) as UTxO;
results.referenceUtxos.lendingPool = lendingPoolValRefUtxo;
data = new TextEncoder().encode(stringify(results));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");


// MARK: TX 7

/**
 * (Tx 7) Initialize the oracle price UTXO
 * tagged with a newly-minted oracle beacon token
 */

lucid.overrideUTxOs(newWalletInputs6);

const priceBcnToken = oraclePolicyID + bcnTknsHex.oraclePrice;
const oracleBcnToMint: Assets = {
    [priceBcnToken]: 1n
};

const referenceInputs = [oracleValRefUtxo, globalCfgUtxo];
const refInputsIdxs = orderUtxosCanonically(referenceInputs);
const cfg_idx = refInputsIdxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;

const oracleBcnMintRdmr: UnifiedRedeemerType = {
    [RedeemerEnum.MintOracleBeacon]: {
        cfg_idx: cfg_idx
    },
};
const oracleBcnMintRedeemer = Data.to(oracleBcnMintRdmr, UnifiedRedeemer);

const updatedPrice = await getUpdatedPrice(lucid);
const initOracleDatumObj: OracleDatumType = {
    timestamp: BigInt(Date.now()),
    validity_period: BigInt(Number(ORACLE_DATA_VALIDITY) * 60 * 60 * 1000),
    quoted_asset: adaAssetClass,
    denomination: tusdDeployed,
    price: updatedPrice,
    consumers: [],
}
const initOracleDatum = makeOracleDatum(initOracleDatumObj);

const [_newWalletInputs7, derivedOutputs7, tx7] = await lucid
    .newTx()
    .mintAssets(oracleBcnToMint, oracleBcnMintRedeemer)
    .pay.ToContract(
        oracleScriptAddr,
        { kind: "inline", value: initOracleDatum },
        { [priceBcnToken]: 1n }
    )
    .readFrom(referenceInputs)
    .addSignerKey(adminPkh)
    .chain();
console.log(`Initialize oracle price UTXO: tx built`);
console.log("");
const signedTx7 = await tx7.sign.withWallet().complete();
console.log(`signedTx7: ${stringify(signedTx7)}`);
console.log(`signedTx7 hash: ${signedTx7.toHash()}`);
console.log(`size: ~${signedTx7.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const tx7Json = JSON.parse(stringify(signedTx7));
console.log(`tx7Fee: ${parseInt(tx7Json.body.fee) / 1_000_000} ADA`);
console.log("");

try {
    if (!dryRun){
        const tx7Hash = await signedTx7.submit();
        console.log(`tx7 submitted. Hash: ${tx7Hash}`);
    }    
    console.log("");
} catch (error) {
    if ((error as Error).message.includes("transaction contains unknown UTxO references as inputs")) {
        console.log(`tx7 consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
        console.log(`Will retry in ${retry_mins} mins. Don't terminate, please wait...`);
        await sleep(retry_mins * 60 * 1000);
        const tx7Hash = await signedTx7.submit();
        console.log("");
        console.log(`tx7 submitted. Hash: ${tx7Hash}`);
        console.log("");
    } else {
        throw error;
    }
}


// Update deployed details file
const initOraclePriceUtxo: UTxO = derivedOutputs7.find((utxo) => {
    if (utxo.assets[priceBcnToken]) return true;
    else return false;
}) as UTxO;

results.oraclePriceUtxo = initOraclePriceUtxo;
results.oraclePriceBcnToken = priceBcnToken;
data = new TextEncoder().encode(stringify(results));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");