import { 
    UTxO,
    Data,
    stringify,
    Credential,
    RedeemerBuilder,
    getAddressDetails
} from "@lucid-evolution/lucid";
import {
    ADMIN_WALLET_SEED,
    CollateralDatum,
    CollateralStatusEnum,
    deployDetailsFile,
    getLucidInstance,
    getMyCollateralUtxo,
    PlutusScriptKey,
    PlutusVerificationKey,
    RedeemerEnum,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    USER1_WALLET_SEED,
    USER2_WALLET_SEED,
    getDeployedRefUtxos,
    parseStringifiedUtxo,
} from "../index.ts";

const dryRun = Deno.args[1] == "dryrun";

const lucid = getLucidInstance();

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

// const refUtxos = await lucid.utxosAt(deployed.refscriptsScriptAddr);
const refUtxos = getDeployedRefUtxos(Object.values(deployed.referenceUtxos));

const user = Deno.args[0];
const userCollateralUtxo: UTxO = parseStringifiedUtxo(deployed[`${user}CollateralUtxo`]);

async function withdrawCollateral() {
    // Switch to user wallet:
    const seed = (() => {
        switch (user) {
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

    const collateralUtxos = dryRun 
        ? [userCollateralUtxo] 
        : await lucid.utxosAt(deployed.collateralScriptAddr);
    const collateralUtxo = dryRun 
        ? userCollateralUtxo 
        : getMyCollateralUtxo(collateralUtxos, userPaymtCred, userStakeCred, CollateralStatusEnum.Available);
    if (!collateralUtxo) {
        console.log(`No collateral utxo found for user`);
        return;
    }
    const inputDatum = Data.from(collateralUtxo.datum!, CollateralDatum);
    // get owner's payment key hash from datum:
    const ownerPaymentHash = Object.hasOwn(inputDatum.owner.payment_credential, "VerificationKey")
        ? (inputDatum.owner.payment_credential as PlutusVerificationKey).VerificationKey[0]
        : (inputDatum.owner.payment_credential as PlutusScriptKey).Script[0];

    const withdrawReqRedeemer: RedeemerBuilder = {
        kind: "selected",
        inputs: [collateralUtxo],
        makeRedeemer: (inputIdxs: bigint[]) => {
            const redeemer: UnifiedRedeemerType = {
                [RedeemerEnum.WithdrawCollateral]: {
                    input_idx: inputIdxs[0],
                },
            };
            return Data.to(redeemer, UnifiedRedeemer);
        },
    };

    const collateralContractRefUtxo = refUtxos.find((utxo) => {
        if (utxo.assets[deployed.refscriptsBcnTokens.collateral]) return true;
        else return false;
    })!;

    const tx = await lucid
        .newTx()
        .collectFrom([collateralUtxo], withdrawReqRedeemer)
        .readFrom([collateralContractRefUtxo])
        .addSignerKey(ownerPaymentHash)
        .complete();
    console.log(`Withdraw collateral tx built`);

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
}

await withdrawCollateral();
