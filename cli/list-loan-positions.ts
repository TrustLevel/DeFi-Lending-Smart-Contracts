import { 
    Data,
    UTxO,    
    credentialToAddress,
    keyHashToCredential
} from "@lucid-evolution/lucid";
import {
    deployDetailsFile,
    getLucidInstance,
    intRatesList,
    PlutusScriptKey,
    PlutusVerificationKey,
    provNetwork,
    RegistryDatum,
    OracleDatum,
    tusdDecimals,
    parseStringifiedUtxo,
    collateralRatio,
    calcAssetValue,
} from "../index.ts";
import Table from "cli-table3";
import BigNumber from "bignumber.js";

const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();
const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const table = new Table({
    head: [
        "Loan ID (pos token)",
        "Borrower",
        "Loan Amount",
        "Collateral Amt",
        "Interest",
        "Term",
        "Maturity",
        "Status",
    ],
    colWidths: [22, 28, 15, 17, 15, 10, 28, 10],
});


// latest oracle price utxo
const { oracleScriptAddr, oraclePolicyID, settingsBcnTokens } = deployed;
const oracleUtxo = dryRun
    ? parseStringifiedUtxo(deployed.oraclePriceUtxo)
    : (await lucid.utxosAtWithUnit(oracleScriptAddr, `${oraclePolicyID}${settingsBcnTokens.oraclePrice}`))[0];
const priceDatum = Data.from(oracleUtxo.datum!, OracleDatum);

/**
 * Position registry UTXOs
 */
const positionUtxos = dryRun
    ? (()=>{
        const utxos: UTxO[] = [];
        if (deployed.user1PosRegUtxo) utxos.push(parseStringifiedUtxo(deployed.user1PosRegUtxo));
        if (deployed.user2PosRegUtxo) utxos.push(parseStringifiedUtxo(deployed.user2PosRegUtxo));
        return utxos;
    })()
    : await lucid.utxosAt(deployed.registryScriptAddr);

if (positionUtxos.length == 0) {
    table.push([
        { colSpan: 8, hAlign: "center", content: 'No open positions at this time.' },
    ]);
} else {
    positionUtxos.forEach((utxo) => {
        // get position token:
        const positionToken = Object.keys(utxo.assets).find((assetId) => assetId.startsWith(deployed.posTokensPolicyId));
        if (!positionToken) return;

        const posID = positionToken.substring(deployed.posTokensPolicyId.length);
        const positionDatum = Data.from(utxo.datum!, RegistryDatum);
        const borrower = positionDatum.borrower;
        const pymntCred = (borrower.payment_credential as PlutusVerificationKey).VerificationKey[0];
        const stakeCred = ((borrower.stake_credential as { Inline: [PlutusVerificationKey | PlutusScriptKey] })
            .Inline[0] as PlutusVerificationKey).VerificationKey[0];
        const borrowerAddr = credentialToAddress(
            provNetwork,
            keyHashToCredential(pymntCred),
            keyHashToCredential(stakeCred),
        );
        const loan = positionDatum.loan;
        const loanAmt = (Number(loan.borrowed_amt) / (10 ** tusdDecimals)).toLocaleString();
        const collAmt = (Number(loan.collateral_amt) / (10 ** tusdDecimals)).toLocaleString();
        const intAmt = (Number(loan.interest_amt) / (10 ** tusdDecimals)).toLocaleString();
        const term = (() => {
            for (const [name, obj] of Object.entries(intRatesList)) {
                if (obj.term === loan.loan_term) return name;
            }
        })()!;

        // check collateralization
        const collateralAmt = loan.collateral_amt;
        const valueRatio = BigNumber(collateralRatio.toString());
        const collateralVal = calcAssetValue(collateralAmt, priceDatum.price);
        const borrowableAmt = collateralVal.times(valueRatio).div(BigNumber(100));
        const loanedAmt = BigNumber(loan.borrowed_amt.toString());
        const undercollateralized = borrowableAmt.lt(loanedAmt);

        // check if loan is overdue
        const overdue = Number(loan.maturity) <= Date.now();

        const status = (() => {
            if (overdue && undercollateralized) return "OD & UC";
            if (overdue) return "OD";
            if (undercollateralized) return "UC";
            return "OK";
        })();

        table.push([
            `${posID.substring(0, 5)}...${posID.substring(posID.length - 5)}`,
            `${borrowerAddr.substring(0, 13)}...${borrowerAddr.substring(borrowerAddr.length - 8)}`,
            { hAlign: "right", content: `${loanAmt} USDM` },
            { hAlign: "right", content: `${collAmt} ADA` },
            { hAlign: "right", content: `${intAmt} USDM` },
            term,
            new Date(Number(loan.maturity)).toISOString(),
            status,
        ]);
    });
}

console.log("");
console.log(`Status codes:`);
console.log(`OD: Overdue`);
console.log(`UC: Undercollateralized`);
console.log(`OK: Not eligible for liquidation`);
console.log(table.toString());
console.log(`Status codes:`);
console.log(`OD: Overdue`);
console.log(`UC: Undercollateralized`);
console.log(`OK: Not eligible for liquidation`);
console.log("");
console.log("");