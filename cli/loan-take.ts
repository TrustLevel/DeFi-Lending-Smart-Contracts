import { 
    UTxO,
    Credential, Data, Datum, fromText, getAddressDetails, RedeemerBuilder, stringify } from "@lucid-evolution/lucid";
import {
    ADMIN_WALLET_SEED,
    AssetClass,
    CollateralDatum,
    CollateralDatumType,
    CollateralStatusEnum,
    deployDetailsFile,
    getLucidInstance,
    getMyCollateralUtxo,
    intRatesList,
    LendingPoolDatum,
    makeCollateralDatum,
    makeRegistryDatum,
    PlutusScriptKey,
    PlutusVerificationKey,
    RedeemerEnum,
    RegistryDatumType,
    sha3,
    sleep,
    tusdDeployed,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    USER1_WALLET_SEED,
    USER2_WALLET_SEED,
    getDeployedRefUtxos,
    parseStringifiedUtxo,
    orderUtxosCanonically,
} from "../index.ts";

// config
// -------------------------------------------------------------------
// amount of loanable asset (tUSDM) to borrow
const borrowAmt = Deno.args[0] == "user1"
    ? 95_352_460n 
    : 45_000_000n; 

// selected from pre-set list of [term, interest_rate] contained in LendingPoolDatum
// change value to get different results / test
const loanTerm = Deno.args[0] == "user1"
    ? intRatesList["3 hrs"].term   // 10_800_000n
    : intRatesList["7 days"].term; // 604_800_000n

/**
 * Time to wait before retrying submission of a failed tx.
 *
 * Applies when a chained tx is rejected for consuming output(s) from the previous tx that
 * is not yet visible in the ledger/mempool.
 */
const retry_mins = 1;
// -------------------------------------------------------------------



const user = Deno.args[0];
const dryRun = Deno.args[1] == "dryrun";

const lucid = getLucidInstance();
const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);
const loanAsset: AssetClass = deployed.loanableAsset ?? tusdDeployed;



// reference scripts utxos:
const refUtxos = getDeployedRefUtxos(Object.values(deployed.referenceUtxos));
const lpContractRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.lendingPool]) return true;
    else return false;
})!;
const collateralContractRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.collateral]) return true;
    else return false;
})!;




// Switch to user wallet:
const [seed, userUtxoKey] = (() => {
    switch (user) {
        case "user1":
            return [USER1_WALLET_SEED, "user1CollateralUtxo"];
        case "user2":
            return [USER2_WALLET_SEED, "user2CollateralUtxo"];
        default:
            return [ADMIN_WALLET_SEED, "userCollateralUtxo"];
    }
})();
lucid.selectWallet.fromSeed(seed);
const userAddress = await lucid.wallet().address();
const userStakeCred = getAddressDetails(userAddress).stakeCredential as Credential;
const userPaymtCred = getAddressDetails(userAddress).paymentCredential as Credential;

// get user's available collateral utxo
const collateralUtxos = dryRun 
    ? [parseStringifiedUtxo(deployed[userUtxoKey])]
    : await lucid.utxosAt(deployed.collateralScriptAddr);

const collateralUtxo = getMyCollateralUtxo(collateralUtxos, userPaymtCred, userStakeCred, CollateralStatusEnum.Available);
if (!collateralUtxo) {
    console.log(`No collateral utxo found for user`);
    Deno.exit(0);
}
const inputDatum = Data.from(collateralUtxo.datum!, CollateralDatum);
// get owner's payment key hash from datum:
const ownerPaymentHash = Object.hasOwn(inputDatum.owner.payment_credential, "VerificationKey")
    ? (inputDatum.owner.payment_credential as PlutusVerificationKey).VerificationKey[0]
    : (inputDatum.owner.payment_credential as PlutusScriptKey).Script[0];

// For reference on how RedeemerBuilder works, see "Redeemer Indexing" in Lucid-evolution docs:
// https://no-witness-labs.github.io/lucid-evolution/documentation/deep-dives/validator-interactions/advanced/redeemer-indexing#redeemer-builder-kinds
const borrowReqRedeemer: RedeemerBuilder = {
    kind: "selected",
    inputs: [collateralUtxo], // collateralUtxo idx here is 0
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.BorrowRequest]: {
                loan_amt: borrowAmt,
                loan_term: loanTerm,
                loan_asset: loanAsset,
                input_idx: inputIdxs[0], // should be same as the idx for collateralUtxo above
                output_idx: 0n, // should be the idx of the collateral output when building the tx
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};

// new collateral datum with 'LoanRequested' status
const loanReqstdDatumObj: CollateralDatumType = {
    ...inputDatum,
    status: {
        [CollateralStatusEnum.LoanRequested]: {
            request: {
                borrowed_asset: loanAsset,
                borrowed_amt: borrowAmt,
                loan_term: loanTerm,
            },
        },
    },
};
const loanReqstdDatum = makeCollateralDatum(loanReqstdDatumObj);

// ***********************************
// 1st tx (user places loan request):
// ***********************************
const [_newWalletInputs, derivedOutputs, userTx] = await lucid
    .newTx()
    .collectFrom([collateralUtxo], borrowReqRedeemer)
    .pay.ToContract(
        deployed.collateralScriptAddr,
        { kind: "inline", value: loanReqstdDatum as Datum },
        collateralUtxo.assets,
    )
    .addSignerKey(ownerPaymentHash) // require signature from collateral owner, taken from input datum
    .readFrom([collateralContractRefUtxo])
    .chain();
console.log(`user's loan request tx built`);

const userSignedTx = await userTx.sign.withWallet().complete();
console.log(`signedTx: ${stringify(userSignedTx)}`);
console.log(`signedTx hash: ${userSignedTx.toHash()}`);
console.log(`size: ~${userSignedTx.toCBOR().length / 2048} KB`);

console.log("");
const txJson = JSON.parse(stringify(userSignedTx));
console.log(`usertxFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
console.log("");
if (!dryRun){
    const userTxHash = await userSignedTx.submit();
    console.log(`tx submitted. Hash: ${userTxHash}`);
}
console.log("");

// update deployDetailsFile
const userBorrowReqKey = (() => {
    switch (user) {
        case "user1":
            return "user1BorrowReqUtxo";
        case "user2":
            return "user2BorrowReqUtxo";
        default:
            return "userBorrowReqUtxo";
    }
})();
const userBorrowReqUtxo: UTxO = getMyCollateralUtxo(
    derivedOutputs, 
    userPaymtCred, 
    userStakeCred, 
    CollateralStatusEnum.LoanRequested
)!;
deployed[userBorrowReqKey] = userBorrowReqUtxo;
let data = new TextEncoder().encode(stringify(deployed));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");








// **********************************************
// chained 2nd tx (admin processes loan request):
// **********************************************

// Switch to admin wallet:
lucid.selectWallet.fromSeed(ADMIN_WALLET_SEED);

// get collateral datum in request utxo
const newCollateralInputDatum = Data.from(userBorrowReqUtxo.datum!, CollateralDatum);
const collateralAsset = newCollateralInputDatum.collateral_asset;
const collateralAssetId = (() => {
    if (collateralAsset.policy_id == "" && collateralAsset.asset_name == "") return "lovelace";
    else return collateralAsset.policy_id + collateralAsset.asset_name;
})();
const collateralAmt = userBorrowReqUtxo.assets[collateralAssetId];

// get lending pool utxo
const lendingPoolUtxo = dryRun 
    ? parseStringifiedUtxo(deployed.poolUtxo) 
    : (await lucid.utxosAt(deployed.lendingPoolScriptAddr))[0];
const lpDatum = Data.from(lendingPoolUtxo.datum!, LendingPoolDatum);

// get oracle price utxo
const oracleUtxos = dryRun 
    ? [parseStringifiedUtxo(deployed.oraclePriceUtxo)]
    : await lucid.utxosAt(deployed.oracleScriptAddr);
const oraclePriceUtxo = oracleUtxos.find((utxo) => {
    if (utxo.assets[deployed.oraclePriceBcnToken]) return true;
    else return false;
})!;

// get global config utxo:
const globalCfgUtxo = parseStringifiedUtxo(deployed.cfgUtxos.globalCfgUtxo);

// calculate payable interest, using applicable interest rate in lending pool datum
const interestAmt = (() => {
    const interestRate = lpDatum.interest_rates.find((rate) => rate[0] == loanTerm);
    if (!interestRate) throw new Error(`No interest rate found for requested loan term: ${loanTerm}`);
    return BigInt(Math.floor((Number(borrowAmt) * Number(interestRate[1])) / 100));
})();

// tx validity range; need to set this now that admin is processing loan request
const validFrom = Date.now() - (10 * 20 * 1000); // start lower bound 10 slots earlier
const validTo = validFrom + (1000 * 60 * 60 * 2); // 2hrs

// calc loan maturity, starting from validTo
const loanMaturity = (() => {
    const loanStart = Math.floor(validTo / 1_000); // in seconds, from validTo (in order to drop the odd millisecs);
    const loanStartMs = loanStart * 1_000; // convert back to millisecs
    return BigInt(loanStartMs) + loanTerm;
})();

// calculate position token name
const posTokenName = await sha3(
    userBorrowReqUtxo.txHash + fromText(String(userBorrowReqUtxo.outputIndex)),
);
const posTokenClass = deployed.posTokensPolicyId + posTokenName;

// new collateral datum ('loan issued' status)
const loanIssuedDatumObj: CollateralDatumType = {
    ...newCollateralInputDatum,
    status: CollateralStatusEnum.LoanIssued,
};
const loanIssuedDatum = Data.to(loanIssuedDatumObj, CollateralDatum);

// position registry datum
const registryDatumObj: RegistryDatumType = {
    borrower: loanIssuedDatumObj.owner,
    loan: {
        collateral_asset: collateralAsset,
        borrowed_asset: loanAsset,
        collateral_amt: collateralAmt,
        borrowed_amt: borrowAmt,
        interest_amt: interestAmt,
        loan_term: loanTerm,
        maturity: loanMaturity,
    },
    pos_id: posTokenName,
    liquidator: null,
};
const registryDatum = makeRegistryDatum(registryDatumObj);

// calculate remaining loanable asset amt in lending pool after processing this loan request
const loanableAssetId = loanAsset.policy_id + loanAsset.asset_name;
const reserveAmt = lendingPoolUtxo.assets[loanableAssetId];
const newReserveAmt = reserveAmt - borrowAmt;

// organize reference inputs
const referenceInputs = [collateralContractRefUtxo, lpContractRefUtxo, oraclePriceUtxo, globalCfgUtxo];
const refInputsIdxs = orderUtxosCanonically(referenceInputs);
const oracle_idx = refInputsIdxs.get(oraclePriceUtxo.txHash + oraclePriceUtxo.outputIndex)!;
const cfg_idx = refInputsIdxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;

// process borrow request redeemer
const spendRedeemer: RedeemerBuilder = {
    kind: "selected",
    inputs: [userBorrowReqUtxo, lendingPoolUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.BorrowProcess]: {
                collateral_idxs: [inputIdxs[0], 0n],
                pool_idxs: [inputIdxs[1], 1n],
                oracle_idx: oracle_idx,
                cfg_idx: cfg_idx,
                registry_output_idx: 2n,
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};
const mintRedeemer: RedeemerBuilder = {
    kind: "selected",
    inputs: [userBorrowReqUtxo, lendingPoolUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.BorrowProcess]: {
                collateral_idxs: [inputIdxs[0], 0n],
                pool_idxs: [inputIdxs[1], 1n],
                oracle_idx: oracle_idx,
                cfg_idx: cfg_idx,
                registry_output_idx: 2n,
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};


// build tx
const [_newAdminWalletInputs, adminDerivedOutputs, adminTx] = await lucid
    .newTx()
    .collectFrom([userBorrowReqUtxo, lendingPoolUtxo], spendRedeemer)
    .mintAssets({ [posTokenClass]: 2n }, mintRedeemer)
    .pay.ToContract(
        deployed.collateralScriptAddr,
        { kind: "inline", value: loanIssuedDatum as Datum },
        {
            ...userBorrowReqUtxo.assets,
            [posTokenClass]: 1n,
        },
    )
    .pay.ToContract(
        deployed.lendingPoolScriptAddr,
        { kind: "inline", value: lendingPoolUtxo.datum! as Datum },
        {
            lovelace: lendingPoolUtxo.assets.lovelace,
            [loanableAssetId]: newReserveAmt,
        },
    )
    .pay.ToContract(
        deployed.registryScriptAddr,
        { kind: "inline", value: registryDatum as Datum },
        {
            [posTokenClass]: 1n,
        },
    )
    .pay.ToAddress(
        userAddress, 
        { [loanableAssetId]: borrowAmt }
    )
    .validFrom(validFrom)
    .validTo(validTo)
    .readFrom(referenceInputs)
    .chain();
console.log(`Admin side loan issue tx built`);

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
        console.log(`Process borrow request tx consumes output(s) from the previous tx that is not yet visible onchain or in the mempool.`);
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
const userPosRegUtxoKey = `${user}PosRegUtxo`;
const userLoanIssuedUtxoKey = `${user}LoanIssuedUtxo`;
const userLoanIssuedUtxo = getMyCollateralUtxo(
    adminDerivedOutputs, 
    userPaymtCred, 
    userStakeCred, 
    CollateralStatusEnum.LoanIssued
)!;
const userPosRegUtxo = adminDerivedOutputs.find((utxo) => {
    if (utxo.address == deployed.registryScriptAddr) return true;
    else return false;
}) as UTxO;
deployed[userPosRegUtxoKey] = userPosRegUtxo;
deployed[userLoanIssuedUtxoKey] = userLoanIssuedUtxo;

const newPoolUtxo = adminDerivedOutputs.find((utxo) => {
    if (utxo.address == deployed.lendingPoolScriptAddr) return true;
    else return false;
}) as UTxO;
deployed.poolUtxo = newPoolUtxo;
data = new TextEncoder().encode(stringify(deployed));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");
