import { 
    UTxO,
    Data,
    Datum,
    stringify,
    Credential,
    RedeemerBuilder,
    getAddressDetails,
} from "@lucid-evolution/lucid";
import {
    ADMIN_WALLET_SEED,
    CollateralDatum,
    CollateralDatumType,
    CollateralStatusEnum,
    deployDetailsFile,
    getLucidInstance,
    getMyCollateralUtxo,
    LendingPoolDatum,
    makeCollateralDatum,
    PlutusScriptKey,
    PlutusVerificationKey,
    RedeemerEnum,
    RegistryDatum,
    sleep,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    USER1_WALLET_SEED,
    USER2_WALLET_SEED,
    getDeployedRefUtxos,
    parseStringifiedUtxo,
    orderUtxosCanonically,
} from "../index.ts";

const user = Deno.args[0];
const dryRun = Deno.args[1] == "dryrun";

const lucid = getLucidInstance();
const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const refUtxos = getDeployedRefUtxos(Object.values(deployed.referenceUtxos));

const collateralContractRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.collateral]) return true;
    else return false;
})!;
const registryContractRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.registry]) return true;
    else return false;
})!;
const lendingPoolContractRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.lendingPool]) return true;
    else return false;
})!;

const globalCfgUtxo = parseStringifiedUtxo(deployed.cfgUtxos.globalCfgUtxo);

/**
 * Time to wait before retrying submission of a failed tx.
 *
 * Applies when a chained tx is rejected for consuming output(s) from the previous tx that
 * is not yet visible in the ledger/mempool.
 */
const retry_mins = 1;

/**
 * Submits 2 transactions for repaying a loan. The first one is the repayment request
 * created by the user. The 2nd - chained to the first one - is where the admin processes
 * the repayment request, spending utxos from both the collateral and lending pool contracts.
 *
 * The repayment asset should be contained in the collateral output created by the user in
 * the 1st tx. In the 2nd tx, the admin transfers this repayment asset to the lending pool
 * and marks the collateral utxo as unlocked, free to be used for another loan or withdrawn.
 *
 * IMPORTANT: Before running this, be sure that the user's wallet already has enough of the
 * borrowed assets to repay the loan principal and the interest.
 *
 * The function performs the following steps:
 * 1. Retrieves the user's locked collateral UTXO.
 * 2. Builds a transaction to place a repayment request for the loan.
 * 3. Signs the transaction with the user's wallet.
 * 4. Submits the transaction.
 * 5. Retrieves the new collateral UTXO (updated with repayment request status) and the lending pool UTXO.
 * 6. Builds a transaction to process the repayment request.
 * 7. Signs the transaction with the admin wallet.
 * 8. Submits the transaction.
 */
async function repayLoan() {
    // Switch to user wallet:
    const [seed, userUtxoKey, posUtxoKey] = (() => {
        switch (user) {
            case "user1":
                return [USER1_WALLET_SEED, "user1LoanIssuedUtxo", "user1PosRegUtxo"];
            case "user2":
                return [USER2_WALLET_SEED, "user2LoanIssuedUtxo", "user2PosRegUtxo"];
            default:
                return [ADMIN_WALLET_SEED, "userLoanIssuedUtxo", "userPosRegUtxo"];
        }
    })();
    lucid.selectWallet.fromSeed(seed);
    const userAddress = await lucid.wallet().address();
    const userStakeCred = getAddressDetails(userAddress).stakeCredential as Credential;
    const userPaymtCred = getAddressDetails(userAddress).paymentCredential as Credential;

    /**
     * Collateral UTXO
     */
    const collateralUtxos = dryRun 
        ? [parseStringifiedUtxo(deployed[userUtxoKey])]
        : await lucid.utxosAt(deployed.collateralScriptAddr);
    const collateralUtxo = getMyCollateralUtxo(collateralUtxos, userPaymtCred, userStakeCred, CollateralStatusEnum.LoanIssued);
    if (!collateralUtxo) {
        console.log(`No collateral utxo found for user`);
        return;
    }
    const inputDatum = Data.from(collateralUtxo.datum!, CollateralDatum);
    // get owner's payment key hash from datum:
    const ownerPaymentHash = Object.hasOwn(inputDatum.owner.payment_credential, "VerificationKey")
        ? (inputDatum.owner.payment_credential as PlutusVerificationKey).VerificationKey[0]
        : (inputDatum.owner.payment_credential as PlutusScriptKey).Script[0];

    // get position token:
    const positionToken = Object.keys(collateralUtxo.assets).find((assetId) => assetId.startsWith(deployed.posTokensPolicyId))!;

    // new collateral datum ('RepayRequested' status)
    const loanRepayReqDatumObj: CollateralDatumType = {
        ...inputDatum,
        status: CollateralStatusEnum.RepayRequested,
    };
    const loanRepayReqstdDatum = makeCollateralDatum(loanRepayReqDatumObj);

    /**
     * Position registry UTXO
     */

    const positionRegUtxo = dryRun
        ? parseStringifiedUtxo(deployed[posUtxoKey])
        : (await lucid.utxosAtWithUnit(deployed.registryScriptAddr, positionToken))[0];
    const positionDatum = Data.from(positionRegUtxo.datum!, RegistryDatum);
    const loan = positionDatum.loan;

    // repayment asset
    const repaymentAssetId = loan.borrowed_asset.policy_id + loan.borrowed_asset.asset_name;
    const repaymentAmt = loan.borrowed_amt + loan.interest_amt;

    // organize reference inputs
    const referenceInputs1 = [collateralContractRefUtxo, positionRegUtxo, globalCfgUtxo];
    const refInputs1Idxs = orderUtxosCanonically(referenceInputs1);
    const reg_idx = refInputs1Idxs.get(positionRegUtxo.txHash + positionRegUtxo.outputIndex)!;
    const cfg_idx = refInputs1Idxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;
    
    // `RepayRequest` redeemer
    const repayReqRedeemer: RedeemerBuilder = {
        kind: "selected",
        inputs: [collateralUtxo],
        makeRedeemer: (inputIdxs: bigint[]) => {
            const redeemer: UnifiedRedeemerType = {
                [RedeemerEnum.RepayRequest]: {
                    collateral_idxs: [inputIdxs[0], 0n],
                    registry_idx: reg_idx,
                    cfg_idx: cfg_idx
                },
            };
            return Data.to(redeemer, UnifiedRedeemer);
        },
    };

    // ***************************************
    // 1st tx (user places repayment request):
    // ***************************************
    const [_newWalletInputs, derivedOutputs, userTx] = await lucid
        .newTx()
        .collectFrom([collateralUtxo], repayReqRedeemer)
        .pay.ToContract(
            deployed.collateralScriptAddr,
            { kind: "inline", value: loanRepayReqstdDatum as Datum },
            {
                ...collateralUtxo.assets,
                [repaymentAssetId]: repaymentAmt,
            },
        )
        .addSignerKey(ownerPaymentHash) // require signature from collateral owner, taken from input datum
        .readFrom(referenceInputs1)
        .chain();
    console.log(`user's repayment request tx built`);

    const userSignedTx = await userTx.sign.withWallet().complete();
    console.log(`signedTx: ${stringify(userSignedTx)}`);
    console.log(`signedTx hash: ${userSignedTx.toHash()}`);
    console.log(`size: ~${userSignedTx.toCBOR().length / 2048} KB`);

    console.log("");
    const txJson = JSON.parse(stringify(userSignedTx));
    console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
    console.log("");
    if (!dryRun){
        const userTxHash = await userSignedTx.submit();
        console.log(`tx submitted. Hash: ${userTxHash}`);        
    }
    console.log("Done with user's repayment request tx.");
    console.log("");

    // update deployDetailsFile
    const userRepayReqUtxoKey = `${user}RepayReqUtxo`;
    const repayReqUtxo = getMyCollateralUtxo(
        derivedOutputs,
        userPaymtCred,
        userStakeCred,
        CollateralStatusEnum.RepayRequested,
    ) as UTxO;
    deployed[userRepayReqUtxoKey] = repayReqUtxo;
    let data = new TextEncoder().encode(stringify(deployed));
    Deno.writeFileSync(deployDetailsFile, data);
    console.log(`Updated ${deployDetailsFile}`);
    console.log("");









    // ***************************************************
    // chained 2nd tx (admin processes repayment request):
    // ***************************************************

    // Switch to admin wallet:
    lucid.selectWallet.fromSeed(ADMIN_WALLET_SEED);        

    // get lending pool utxo
    const lendingPoolUtxo = dryRun 
        ? parseStringifiedUtxo(deployed.poolUtxo) 
        : (await lucid.utxosAt(deployed.lendingPoolScriptAddr))[0];
    const lpDatum = Data.from(lendingPoolUtxo.datum!, LendingPoolDatum);

    // tx validity range; need to set this now that admin is processing repayment request
    const validFrom = Date.now() - (10 * 20 * 1000); // start lower bound 10 slots earlier
    const validTo = validFrom + (1000 * 60 * 60 * 2); // 2hrs

    // new collateral datum (unlocked status)
    const reqDatum = Data.from(repayReqUtxo.datum!, CollateralDatum);
    const repaymentProcessedDatumObj: CollateralDatumType = { 
        ...reqDatum, 
        status: CollateralStatusEnum.Available
    };
    const repaymentProcessedDatum = makeCollateralDatum(repaymentProcessedDatumObj);

    // calculate updated loanable asset amt in lending pool after processing this repayment request
    const loanableAssetId = lpDatum.loanable_asset.policy_id + lpDatum.loanable_asset.asset_name;
    const reserveAmt = lendingPoolUtxo.assets[loanableAssetId];
    const newReserveAmt = reserveAmt + repaymentAmt;

    // new collateral output value
    const newCollateralAssets = { ...repayReqUtxo.assets };
    if (newCollateralAssets[repaymentAssetId]) delete newCollateralAssets[repaymentAssetId];
    if (newCollateralAssets[positionToken]) delete newCollateralAssets[positionToken];

    // organize reference inputs
    const referenceInputs2 = [
        collateralContractRefUtxo,
        lendingPoolContractRefUtxo,
        registryContractRefUtxo,
        globalCfgUtxo
    ];
    const refInputs2Idxs = orderUtxosCanonically(referenceInputs2);
    const cfg_idx2 = refInputs2Idxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;
    
    // spend redeemer
    const spendRedeemer: RedeemerBuilder = {
        kind: "selected",
        inputs: [repayReqUtxo, lendingPoolUtxo, positionRegUtxo],
        makeRedeemer: (inputIdxs: bigint[]) => {
            const redeemer: UnifiedRedeemerType = {
                [RedeemerEnum.RepayProcess]: {
                    collateral_idxs: [inputIdxs[0], 0n],
                    pool_idxs: [inputIdxs[1], 1n],
                    cfg_idx: cfg_idx2,
                    registry_input_idx: inputIdxs[2],
                },
            };
            return Data.to(redeemer, UnifiedRedeemer);
        },
    };
    const burnRedeemer: RedeemerBuilder = {
        kind: "selected",
        inputs: [repayReqUtxo, lendingPoolUtxo, positionRegUtxo],
        makeRedeemer: (inputIdxs: bigint[]) => {
            const redeemer: UnifiedRedeemerType = {
                [RedeemerEnum.RepayProcess]: {
                    collateral_idxs: [inputIdxs[0], 0n],
                    pool_idxs: [inputIdxs[1], 1n],
                    cfg_idx: cfg_idx2,
                    registry_input_idx: inputIdxs[2],
                },
            };
            return Data.to(redeemer, UnifiedRedeemer);
        },
    };

    // build admin tx
    const [_newAdminInputs, adminDerivedOutputs, adminTx] = await lucid
        .newTx()
        .collectFrom([repayReqUtxo, lendingPoolUtxo, positionRegUtxo], spendRedeemer)
        .mintAssets({ [positionToken]: -2n }, burnRedeemer)
        .pay.ToContract(
            deployed.collateralScriptAddr,
            { kind: "inline", value: repaymentProcessedDatum as Datum },
            newCollateralAssets,
        )
        .pay.ToContract(
            deployed.lendingPoolScriptAddr,
            { kind: "inline", value: lendingPoolUtxo.datum! as Datum },
            {
                ...lendingPoolUtxo.assets,
                [loanableAssetId]: newReserveAmt,
            },
        )
        .validFrom(validFrom)
        .validTo(validTo)
        .readFrom(referenceInputs2)
        .setMinFee(1334834n)
        .chain();
    console.log(`tx built`);

    const adminSignedTx = await adminTx.sign.withWallet().complete();
    console.log(`adminSignedTx: ${stringify(adminSignedTx)}`);
    console.log(`adminSignedTx hash: ${adminSignedTx.toHash()}`);
    console.log(`size: ~${adminSignedTx.toCBOR().length / 2048} KB`);

    console.log("");
    const adminTxJson = JSON.parse(stringify(adminSignedTx));
    console.log(`txFee: ${parseInt(adminTxJson.body.fee) / 1_000_000} ADA`);
    console.log("");

    try {
        if (!dryRun){
            const adminTxHash = await adminSignedTx.submit();
            console.log(`tx submitted. Hash: ${adminTxHash}`);
        }
        console.log("");
    } catch (error) {
        if ((error as Error).message.includes("transaction contains unknown UTxO references as inputs")) {
            console.log(`tx2 (adminTx) consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
            console.log(`Will retry in ${retry_mins} mins. Don't terminate, please wait...`);
            await sleep(retry_mins * 60 * 1000);
            const adminTxHash = await adminSignedTx.submit();
            console.log("");
            console.log(`tx submitted. Hash: ${adminTxHash}`);
            console.log("");
        } else {
            throw error;
        }
    }

    // update deployDetailsFile
    delete deployed[`${user}BorrowReqUtxo`];
    delete deployed[`${user}LoanIssuedUtxo`];
    delete deployed[`${user}PosRegUtxo`];
    delete deployed[userRepayReqUtxoKey];

    const newUserCollateralUtxo = getMyCollateralUtxo(
        adminDerivedOutputs,
        userPaymtCred,
        userStakeCred,
        CollateralStatusEnum.Available,
    ) as UTxO;
    deployed[`${user}CollateralUtxo`] = newUserCollateralUtxo;
    
    const newPoolUtxo = adminDerivedOutputs.find((utxo) => {
        if (utxo.address == deployed.lendingPoolScriptAddr) return true;
        else return false;
    }) as UTxO;
    deployed.poolUtxo = newPoolUtxo;
    
    data = new TextEncoder().encode(stringify(deployed));
    Deno.writeFileSync(deployDetailsFile, data);
    console.log(`Updated ${deployDetailsFile}`);
    console.log("");
}
await repayLoan();
