import { UTxO, sortUTxOs, ScriptType } from "@lucid-evolution/lucid";
import { crypto } from "@std/crypto";
import { decodeHex, encodeHex } from "@std/encoding/hex";
import { adminAddress, AssetClass, getLucidInstance, refscriptsBcnTokens } from "./common.ts";
import BigNumber from "bignumber.js";

const wantedRefUtxoTokens = [
    refscriptsBcnTokens.refscripts,
    refscriptsBcnTokens.collateral,
    refscriptsBcnTokens.lendingPool,
    refscriptsBcnTokens.oracle,
    refscriptsBcnTokens.registry,
];

/**
 * Find utxos that can be used in transaction to deploy validators as reference scripts. The utxos should contain the beacon tokens
 * needed to go along with each reference script. Additional utxos will also be selected until there is a total of at least
 * 100_000_000 lovelace in the selected utxos.
 *
 * @param utxos - The list of utxos to select from
 * @param reserved - An optional utxo that should not be included in the result
 * @returns A tuple of the selected utxos and a mapping from the indices of the selected utxos in the input array to the utxos themselves.
 */
export function getDeployUtxos(utxos: UTxO[], reserved?: UTxO): [UTxO[], Record<number, UTxO>] {
    const reservedId = reserved ? reserved.txHash + reserved.outputIndex : undefined;
    const foundRefUtxoTokens: Record<number, UTxO> = {};

    let adaInFoundRefUtxos = 0n;
    wantedRefUtxoTokens.forEach((token) => {
        for (const [idx, utxo] of (Object.entries(utxos) as unknown as [number, UTxO][])) {
            if (utxo.assets[token] && !foundRefUtxoTokens[idx]) {
                foundRefUtxoTokens[idx] = utxo;
                adaInFoundRefUtxos += utxo.assets["lovelace"];
            }
        }
    });
    const deployUtxos = Object.entries(foundRefUtxoTokens).map(([, utxo]) => utxo);

    if (adaInFoundRefUtxos < 100_000_000n) {
        Object.entries(utxos).forEach(([idx, utxo]) => {
            const utxoId = utxo.txHash + utxo.outputIndex;
            if (adaInFoundRefUtxos < 100_000_000n && !foundRefUtxoTokens[Number(idx)]) {
                if (utxoId !== reservedId) {
                    adaInFoundRefUtxos += utxo.assets["lovelace"];
                    foundRefUtxoTokens[Number(idx)] = utxo;
                    deployUtxos.push(utxo);
                }
            }
        });
    }

    return [deployUtxos, foundRefUtxoTokens];
}

/**
 * Retrieves the total amount of a specified loanable asset at the admin address.
 *
 * This function calculates the total amount of the given loanable asset by
 * iterating through all UTXOs at the admin address, summing up the asset's
 * quantities found in those UTXOs.
 *
 * @param loanableAsset - The asset class containing policy ID and asset name
 *                        of the loanable asset to be queried.
 * @returns The total amount of the specified loanable asset at the admin address.
 */

export async function getLoanableAssetAtAdminAddress(loanableAsset: AssetClass) {
    const lucid = getLucidInstance();
    const loanableAssetId = loanableAsset.policy_id + loanableAsset.asset_name;
    const utxos = await lucid.utxosAt(adminAddress);
    let totalAmt = 0n;
    for (const utxo of utxos) {
        if (utxo.assets[loanableAssetId]) {
            totalAmt += utxo.assets[loanableAssetId];
        }
    }
    return totalAmt;
}

export async function sha3(hex: string) {
    const hash = await crypto.subtle.digest(
        "SHA3-256",
        decodeHex(hex),
    );
    return encodeHex(hash);
}

export async function blake2b_256(hex: string) {
    const hash = await crypto.subtle.digest(
        "BLAKE2B-256",
        decodeHex(hex),
    );
    return encodeHex(hash);
}

export function calcAssetValue(fromAmt: bigint, priceQuote: [bigint, bigint]) {
    const sourceAmt = BigNumber(fromAmt.toString());
    const price = BigNumber(priceQuote[0].toString());
    const priceDecimals = BigNumber(priceQuote[1].toString());
    const priceDenom = BigNumber(10).pow(priceDecimals);
    const val = sourceAmt.times(price).div(priceDenom);
    return val
}

export function calcToReceiveWithSlippage(inAmt: bigint, priceQuote: [bigint, bigint], slippage: number) {
    const value = calcAssetValue(inAmt, priceQuote);
    const slip = BigNumber(slippage).div(BigNumber(100));
    const slippageAmt = value.times(slip);
    return value.minus(slippageAmt);
}

export function sleep(delay: number) {
    return new Promise((resolve) => setTimeout(resolve, delay));
}

export function formattedTime(tstamp: number | bigint): string {
    return (new Date(Number(tstamp))).toISOString();
}
export function logTimeNow() {
    return `[${formattedTime(Date.now())}]:`;
}


export type StringifiedUtxo = {
    txHash: string;
    outputIndex: number;
    assets: { [key: string]: string };
    address: string;
    datum?: string;
    datumHash?: string;
    scriptRef: {
        type: ScriptType;
        script: string;
    }
}
export function getDeployedRefUtxos(rawList: StringifiedUtxo[]): UTxO[] {
    return rawList.map((utxo: StringifiedUtxo) => parseStringifiedUtxo(utxo));
}

export function parseStringifiedUtxo(rawUtxo: StringifiedUtxo): UTxO {
    const assets: { [key: string]: bigint } = {};
        Object.entries(rawUtxo.assets).map(([assetId, amt]) => {
            assets[assetId] = BigInt(parseInt(amt));
        });
    return {
        txHash: rawUtxo.txHash,
        outputIndex: rawUtxo.outputIndex,
        assets: assets,
        address: rawUtxo.address,
        datum: rawUtxo.datum ?? undefined,
        datumHash: rawUtxo.datumHash ?? undefined,
        scriptRef: rawUtxo.scriptRef,
    };
}

export function orderUtxosCanonically(utxos: UTxO[]) {
    const sortedInputs = sortUTxOs(utxos, "Canonical");
    const indicesMap: Map<string, bigint> = new Map();
    sortedInputs.forEach((value, index) => {
      indicesMap.set(value.txHash + value.outputIndex, BigInt(index));
    });
    return indicesMap;
}