import { 
    UTxO,
    Credential,
    Data,
    Datum,
    getAddressDetails,
    RedeemerBuilder,
    stringify
} from "@lucid-evolution/lucid";
import {
    ADMIN_WALLET_SEED,
    CollateralDatum,
    CollateralStatusEnum,
    deployDetailsFile,
    getLucidInstance,
    getMyCollateralUtxo,
    makeCollateralDatum,
    RedeemerEnum,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    USER1_WALLET_SEED,
    USER2_WALLET_SEED,
    parseStringifiedUtxo,
} from "../index.ts";

const user = Deno.args[0];
const dryRun = Deno.args[1] == "dryrun";

const lucid = getLucidInstance();
const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const refUtxos = await lucid.utxosAt(deployed.refscriptsScriptAddr);
const collateralContractRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.collateral]) return true;
    else return false;
})!;

/**
 * Cancels a loan request by resetting the 'loan requested' status of the user's collateral.
 *
 * This function switches to the user's wallet, retrieves the user's collateral UTXO,
 * and constructs a transaction to reset the loan status. It requires the collateral owner's
 * payment key hash for signing. The transaction is signed by the user only.
 *
 * The function performs the following steps:
 * 1. Switches to the user's wallet and retrieves the user's address and credentials.
 * 2. Finds the user's collateral UTXO at the deployed collateral script address.
 * 3. Constructs a new datum object with the loan status reset and converts it to a datum.
 * 4. Builds a transaction to collect the collateral UTXO and send it back to the contract with the new datum.
 * 5. Signs the transaction with the user's wallet and submits it.
 */

async function cancelLoanRequest() {
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
    const userPaymentHash = userPaymtCred.hash; // payment PKH

    const collateralUtxos = dryRun
        ? [parseStringifiedUtxo(deployed[`${user}BorrowReqUtxo`])]
        : await lucid.utxosAt(deployed.collateralScriptAddr);    
    const collateralUtxo = getMyCollateralUtxo(collateralUtxos, userPaymtCred, userStakeCred, CollateralStatusEnum.LoanRequested);
    if (!collateralUtxo) {
        console.log(`No collateral utxo found for user`);
        return;
    }
    const collateralDatum = Data.from(collateralUtxo.datum!, CollateralDatum);

    const resetReqRedeemer: RedeemerBuilder = {
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

    // new collateral datum (reset 'available' status)
    const newCollateralDatum = makeCollateralDatum({
        ...collateralDatum,
        status: CollateralStatusEnum.Available,
    });

    const [_newWalletInputs, derivedOutputs, userTx] = await lucid
        .newTx()
        .collectFrom([collateralUtxo], resetReqRedeemer)
        .pay.ToContract(
            deployed.collateralScriptAddr,
            { kind: "inline", value: newCollateralDatum as Datum },
            collateralUtxo.assets,
        )
        .addSignerKey(userPaymentHash) // require signature from user
        .readFrom([collateralContractRefUtxo])
        .chain();
    console.log(`loan request reset tx built`);

    // sign with user's account
    const userSignedTx = await userTx.sign.withWallet().complete();

    console.log(`signedTx: ${stringify(userSignedTx)}`);
    console.log(`signedTx hash: ${userSignedTx.toHash()}`);
    console.log(`size: ~${userSignedTx.toCBOR().length / 2048} KB`);

    console.log("");
    const txJson = JSON.parse(stringify(userSignedTx));
    console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
    console.log("");

    if (!dryRun){
        const txHash = await userSignedTx.submit();
        console.log(`tx submitted. Hash: ${txHash}`);
    }    
    console.log("");

    // update deployDetailsFile
    const userCollateralUtxo: UTxO = derivedOutputs.find((utxo) => {
        if (utxo.address == deployed.collateralScriptAddr) return true;
        else return false;
    }) as UTxO;
    deployed[`${user}CollateralUtxo`] = userCollateralUtxo;
    const data = new TextEncoder().encode(stringify(deployed));
    Deno.writeFileSync(deployDetailsFile, data);
    console.log(`Updated ${deployDetailsFile}`);
    console.log("");
    console.log("");
}
await cancelLoanRequest();
