import { Data, toText } from "@lucid-evolution/lucid";
import {
    deployDetailsFile,
    getLucidInstance,
    parseStringifiedUtxo,
    ORACLE_PRVDR1_SEED,
    AuditDatum,
    tusdDecimals,
} from "../index.ts";
import Table from "cli-table3";
import BigNumber from "bignumber.js";

const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();
// switch to oracle provider wallet
lucid.selectWallet.fromSeed(ORACLE_PRVDR1_SEED);

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const table = new Table({
    head: [
        "Item",
        "Parsed Value",
    ],
    colWidths: [30, 50],
});

const {
    auditUtxo,
    auditScriptAddr,
    settingsPolicyID,
    settingsBcnTokens,    
} = deployed;

const lastAuditUtxo = dryRun
    ? parseStringifiedUtxo(auditUtxo)
    : (await lucid.utxosAtWithUnit(auditScriptAddr, `${settingsPolicyID}${settingsBcnTokens.audit}`))[0];
const lastAuditDatum = Data.from(lastAuditUtxo.datum!, AuditDatum);

const {
    timestamp,
    collateral_asset,
    loanable_asset,
    collateral_ratio,
    total_collateral,
    total_borrowed,
    health_score,
    utilization_rate
} = lastAuditDatum;
const time = new Date(Number(timestamp)).toISOString();
const collateralId = (()=>{
    if (collateral_asset.policy_id == "" && collateral_asset.asset_name == "") return "ADA";
    return collateral_asset.policy_id + "." + collateral_asset.asset_name;
})();
const loanableId = loanable_asset.policy_id + "." + loanable_asset.asset_name;
const loanableSymbol = toText(loanable_asset.asset_name.substring(loanable_asset.asset_name.length - 10));
const collateralRatio = collateral_ratio.toString() + "%";
const totalCollateral = (Number(total_collateral) / (10 ** tusdDecimals)).toLocaleString();
const totalBorrowed = (Number(total_borrowed) / (10 ** tusdDecimals)).toLocaleString();
const totalReserve = (Number(utilization_rate[1]) / (10 ** tusdDecimals)).toLocaleString();
const healthScore = (()=>{
    const numerator = BigNumber(health_score[0].toString());
    const denominator = BigNumber(health_score[1].toString());
    return numerator.div(denominator).toFixed(2);
})();
const utilizationRate = (()=>{
    const numerator = BigNumber(utilization_rate[0].toString());
    const denominator = BigNumber(utilization_rate[1].toString());
    return numerator.div(denominator).times(BigNumber(100)).toFixed(2) + "%";
})();

table.push([`Time updated`, time]);
table.push([`Collateral asset ID`, collateralId]);
table.push([`Loanable asset ID`, `${loanableId.substring(0, 10)}...${loanableId.substring(loanableId.length - 30)}`]);
table.push([`Loan-to-value ratio`, collateralRatio]);
table.push([`Total collateral locked`, `${totalCollateral} ${collateralId}`]);
table.push([`Total borrowed`, `${totalBorrowed} ${loanableSymbol}`]);
table.push([`Overall health score`, healthScore]);
table.push([`Total reserve`, `${totalReserve}  ${loanableSymbol}`]);
table.push([`Utilization rate`, utilizationRate]);

console.log(table.toString());
console.log("Note: Health score is the ratio of the *total collateral value* to the *total amount borrowed*.");
console.log("A health score of 1.0 indicates a maxed-out position.");
console.log("");
console.log("");