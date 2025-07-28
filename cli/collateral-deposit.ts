import { 
    Data,
    UTxO,
    Datum,
    stringify,
    Credential,
    getAddressDetails,
} from "@lucid-evolution/lucid";
import {
    ADMIN_WALLET_SEED,
    CollateralDatum,
    CollateralDatumType,
    CollateralStatusEnum,
    deployDetailsFile,
    getLucidInstance,
    USER1_WALLET_SEED,
    USER2_WALLET_SEED,
} from "../index.ts";

// config: amount of collateral asset to deposit to the collateral contract
// -------------------------------------------------------------------
const collateralAmtToDeposit = (() => {
    switch (Deno.args[0]) {
        case "user1":
            return 200_000_000n;
        case "user2":
            return 100_000_000n;
        default:
            return 900_000_000n;
    }
})();
// -------------------------------------------------------------------

const dryRun = Deno.args[1] == "dryrun";

const lucid = getLucidInstance();

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);
const { collateralScriptAddr } = deployed;
// const globalCfgUtxo = parseStringifiedUtxo(deployed.cfgUtxos.globalCfgUtxo);
// const globalCfgDatum = Data.from(globalCfgUtxo.datum, SettingsDatum) as {[SettingsEnum.GlobalSettings]: GlobalSettingsType};
// const globalCfg = globalCfgDatum[SettingsEnum.GlobalSettings];


// Switch to user wallet:
const seed = (() => {
    switch (Deno.args[0]) {
        case "user1":
            return USER1_WALLET_SEED;
        case "user2":
            return USER2_WALLET_SEED;
        default:
            return ADMIN_WALLET_SEED;
    }
})();
lucid.selectWallet.fromSeed(seed);
const userAddress = await lucid.wallet().address();
const userStakeCred = getAddressDetails(userAddress).stakeCredential as Credential;
const userPaymtCred = getAddressDetails(userAddress).paymentCredential as Credential;
const userStakeHash = userStakeCred.hash; // staking PKH
const userPaymentHash = userPaymtCred.hash; // payment PKH

// build collateral datum
const collateralDatumObj: CollateralDatumType = {
    owner: {
        payment_credential: { VerificationKey: [userPaymentHash] },
        stake_credential: { Inline: [{ VerificationKey: [userStakeHash] }] },
    },
    collateral_asset: deployed.collateralAsset,
    status: CollateralStatusEnum.Available,
};
const collateralDatum: Datum = Data.to(collateralDatumObj, CollateralDatum);

// build tx
const [_newWalletInputs, derivedOutputs, tx] = await lucid
    .newTx()
    .pay.ToContract(
        collateralScriptAddr,
        { kind: "inline", value: collateralDatum as Datum },
        { lovelace: collateralAmtToDeposit },
    )
    .chain();
console.log(`Collateral deposit tx built.`);

const signedTx = await tx.sign.withWallet().complete();
console.log(`signedTx: ${stringify(signedTx)}`);
console.log(`signedTx hash: ${signedTx.toHash()}`);
console.log(`size: ~${signedTx.toCBOR().length / 2048} KB`);

console.log("");
const txJson = JSON.parse(stringify(signedTx));
console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
console.log("");
if (!dryRun){
    const txHash = await signedTx.submit();
    console.log(`tx submitted. Hash: ${txHash}`);
}
console.log("");


// update deployDetailsFile
const userUtxoKey = (() => {
    switch (Deno.args[0]) {
        case "user1":
            return "user1CollateralUtxo";
        case "user2":
            return "user2CollateralUtxo";
        default:
            return "userCollateralUtxo";
    }
})();
const userCollateralUtxo: UTxO = derivedOutputs.find((utxo) => {
    if (utxo.address == collateralScriptAddr) return true;
    else return false;
}) as UTxO;
deployed[userUtxoKey] = userCollateralUtxo;
const data = new TextEncoder().encode(stringify(deployed));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");