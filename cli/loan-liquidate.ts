import { 
    UTxO,
    Data,
    stringify,
    RedeemerBuilder,
    getAddressDetails,
    credentialToAddress,
} from "@lucid-evolution/lucid";
import {
    Address,
    adminPkh, 
    provNetwork,
    deployDetailsFile, 
    getLucidInstance,
    OracleDatum,
    RedeemerEnum,
    RegistryDatum,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    getDeployedRefUtxos,
    parseStringifiedUtxo,
    orderUtxosCanonically,
    collateralRatio,
    provider1PaymentHash,
    minswapDex,
    makeRegistryDatum,
    ORACLE_PRVDR1_SEED,
    minswapOrderEnterpAddress,
    MinswapOrderDatumType,
    makeMinswapOrderDatum,
    minswapLpToken,
    MinswapEODType,
    MinswapEODEnum,
    OAMEnum,
    OrderAuthorizationMethodType,
    blake2b_256,
    OrderStepEnum,
    OrderStepType,
    SwapAmountOptionEnum,
    SwapAmountOptionType,
    calcAssetValue,
    getPoolByLpToken,
    calculateAmountOut,
    calcAmtWithSlippage,
} from "../index.ts";
import BigNumber from "bignumber.js";

const dryRun = Deno.args[0] == "dryrun";

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

// global settings
const globalCfgUtxo = parseStringifiedUtxo(deployed.cfgUtxos.globalCfgUtxo);

// latest oracle price utxo
const oracleUtxos = dryRun
    ? [parseStringifiedUtxo(deployed.oraclePriceUtxo)]
    : await lucid.utxosAt(deployed.oracleScriptAddr);
const oraclePriceUtxo = oracleUtxos.find((utxo) => {
    if (utxo.assets[deployed.oraclePriceBcnToken]) return true;
    else return false;
})!;



/**
 * Liquidates an open loan that is either already overdue, or undercollateralized.
 */
async function liquidate() {
    // Switch to oracle provider (liquidator) wallet:
    lucid.selectWallet.fromSeed(ORACLE_PRVDR1_SEED); 

    const priceDatum = Data.from(oraclePriceUtxo.datum!, OracleDatum);

    // registry/position utxos
    const positionUtxos = dryRun 
        ? (()=>{
            const utxos: UTxO[] = [];
            if (deployed.user1PosRegUtxo) utxos.push(parseStringifiedUtxo(deployed.user1PosRegUtxo));
            if (deployed.user2PosRegUtxo) utxos.push(parseStringifiedUtxo(deployed.user2PosRegUtxo));
            return utxos;
        })()
        : await lucid.utxosAt(deployed.registryScriptAddr);

    // find an overdue or undercollateralized position:
    const posUtxoForLiquidation = positionUtxos.find((utxo) => {
        const positionDatum = Data.from(utxo.datum!, RegistryDatum);
        const loan = positionDatum.loan;

        const collateralAmt = loan.collateral_amt;
        const valueRatio = BigNumber(collateralRatio.toString());
        const collateralVal = calcAssetValue(collateralAmt, priceDatum.price);
        const borrowableAmt = collateralVal.times(valueRatio).div(BigNumber(100));
        const loanedAmt = BigNumber(loan.borrowed_amt.toString());
        const undercollateralized = borrowableAmt.lt(loanedAmt);

        const overdue = Number(loan.maturity) <= Date.now();

        return undercollateralized || overdue;
    });

    if (!posUtxoForLiquidation) {
        console.log(`No positions eligible for liquidation.`);
        return;
    }
    // for-liquidation position details
    const positionDatum = Data.from(posUtxoForLiquidation.datum!, RegistryDatum);
    const loan = positionDatum.loan;

    // get position token ID:
    const positionToken = Object.keys(posUtxoForLiquidation.assets).find((assetId) => assetId.startsWith(deployed.posTokensPolicyId))!;

    // collateral utxo
    const collateralUtxo = dryRun 
        ? (()=>{
            const utxos: UTxO[] = [];
            if (deployed.user1LoanIssuedUtxo) utxos.push(parseStringifiedUtxo(deployed.user1LoanIssuedUtxo));
            if (deployed.user2LoanIssuedUtxo) utxos.push(parseStringifiedUtxo(deployed.user2LoanIssuedUtxo));
            return utxos.find((utxo) => Object.hasOwn(utxo.assets, positionToken))!;
        })()
        : (await lucid.utxosAtWithUnit(deployed.collateralScriptAddr, positionToken))[0];
    

    // organize reference inputs
    const referenceInputs = [
        collateralContractRefUtxo,
        registryContractRefUtxo,
        oraclePriceUtxo,
        globalCfgUtxo
    ];
    const refInputsIdxs = orderUtxosCanonically(referenceInputs);
    const oracle_idx = refInputsIdxs.get(oraclePriceUtxo.txHash + oraclePriceUtxo.outputIndex)!;
    const cfg_idx = refInputsIdxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;

    // liquidate redeemer
    const spendRedeemer: RedeemerBuilder = {
        kind: "selected",
        inputs: [collateralUtxo, posUtxoForLiquidation],
        makeRedeemer: (inputIdxs: bigint[]) => {
            const redeemer: UnifiedRedeemerType = {
                [RedeemerEnum.LiquidateCollateral]: {
                    collateral_input_idx: inputIdxs[0],
                    registry_idxs: [inputIdxs[1], 0n],
                    dex_output_idx: 1n,
                    oracle_idx: oracle_idx,
                    cfg_idx: cfg_idx,
                    liquidation_dex: minswapDex,
                    liquidator: provider1PaymentHash
                },
            };
            return Data.to(redeemer, UnifiedRedeemer);
        },
    };

    // new registry output value and datum
    const newPosUtxoAssets = { ...posUtxoForLiquidation.assets };
    newPosUtxoAssets[positionToken] = 2n;
    positionDatum.liquidator = provider1PaymentHash;
    const updatedPositionDatum = makeRegistryDatum(positionDatum);

    // MARK: DEX ORDER OUTPUT
    const collateralAssetId = loan.collateral_asset.policy_id + loan.collateral_asset.asset_name || "lovelace";
    const assetsToSwap = {
        [collateralAssetId]: loan.collateral_amt
    };
    // add lovelace for dex deposit + swap fee
    assetsToSwap.lovelace = Object.hasOwn(assetsToSwap, "lovelace") 
        ? assetsToSwap.lovelace + 4_000_000n 
        : 4_000_000n;
    const orderAuthMethod: OrderAuthorizationMethodType = {
        [OAMEnum.OAMSignature]: {pub_key_hash: adminPkh}
    }
    const collateralScriptDetails = getAddressDetails(deployed.collateralScriptAddr);
    const swapReceiver: Address = {
        payment_credential: { Script: [collateralScriptDetails.paymentCredential!.hash] },
        stake_credential: { 
            Inline: [{
                Script: [collateralScriptDetails.stakeCredential!.hash]
            }]
        }
    }
    const eodHash = await blake2b_256(updatedPositionDatum);
    const extraOrderDatum: MinswapEODType = {
        [MinswapEODEnum.MinEODDatumHash]: { hash: eodHash }
    }
    const swapAmtOption: SwapAmountOptionType = {
        [SwapAmountOptionEnum.SAOSpecificAmount]: {
            swap_amount: loan.collateral_amt,
        }
    }
    const dexPool = await getPoolByLpToken(minswapLpToken, lucid);
    const amountOut = calculateAmountOut({
        reserveIn: dexPool.reserve_a,
        reserveOut: dexPool.reserve_b,
        amountIn: loan.collateral_amt,
        tradingFeeNumerator: dexPool.base_fee_a_numerator,
    });
    // calc minimum amount to receive with slippage of 2%
    const minToReceive = calcAmtWithSlippage({
        slippageTolerancePercent: 2,
        amount: amountOut,
        type: "down",
    });
    const orderStep: OrderStepType = {
        [OrderStepEnum.SwapExactIn]: {
            a_to_b_direction: true, // ada to tusdm
            swap_amount_option: swapAmtOption,
            minimum_receive: minToReceive,
            killable: true,
        }
    }
    
    const minswapOrderDatumObj: MinswapOrderDatumType = {
        canceller: orderAuthMethod,
        refund_receiver: swapReceiver,
        refund_receiver_datum: extraOrderDatum,
        success_receiver: swapReceiver,
        success_receiver_datum: extraOrderDatum,
        lp_asset: minswapLpToken,
        step: orderStep,
        max_batcher_fee: 700_000n,
        expiry_setting_opt: null,
    }
    const minswapOrderDatum = makeMinswapOrderDatum(minswapOrderDatumObj);

    const minswapAddrDetails = getAddressDetails(minswapOrderEnterpAddress);
    const ourAddrDetails = getAddressDetails(collateralUtxo.address);
    const minswapOrderAddress = credentialToAddress(
        provNetwork,
        minswapAddrDetails.paymentCredential!,
        ourAddrDetails.stakeCredential!
    );
    
    // tx validity range
    const validFrom = Date.now() - (10 * 20 * 1000); // start lower bound 10 slots earlier to avoid demeter.run errors
    const validTo = validFrom + (1000 * 60 * 60 * 1); // 1hr

    // MARK: BUILD TX

    const [_newWalletInputs, derivedOutputs, tx] = await lucid
        .newTx()
        .collectFrom([collateralUtxo, posUtxoForLiquidation], spendRedeemer)
        .pay.ToContract(
            deployed.registryScriptAddr,
            { kind: "inline", value: updatedPositionDatum },
            newPosUtxoAssets,
        )
        .pay.ToContract(
            minswapOrderAddress,
            { kind: "inline", value: minswapOrderDatum },
            assetsToSwap,
        )
        .validFrom(validFrom)
        .validTo(validTo)
        .attachMetadata(674, { msg: ["Minswap: Market Order"] })
        .addSignerKey(provider1PaymentHash) // require signature from liquidator
        .readFrom(referenceInputs)
        // .setMinFee(622017n)
        .chain();
    console.log(`liquidate tx built`);

    // sign with liquidator's account
    const signedTx = await tx.sign.withWallet().complete();

    console.log(`signedTx: ${stringify(signedTx)}`);
    console.log(`signedTx hash: ${signedTx.toHash()}`);
    console.log(`size: ~${signedTx.toCBOR().length / 2048} KB`);

    console.log("");
    const txJson = JSON.parse(stringify(signedTx));
    console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
    console.log("");

    if (!dryRun) {
        const txHash = await signedTx.submit();
        console.log(`tx submitted. Hash: ${txHash}`);
    }
    console.log("");


    
    // update deployDetailsFile
    const liquidatedPosUtxo = derivedOutputs.find((utxo) => {
        if (utxo.address == deployed.registryScriptAddr) return true; 
        else return false;       
    });
    if (!deployed.liquidatedPosUtxos) deployed.liquidatedPosUtxos = [];
    deployed.liquidatedPosUtxos.push(liquidatedPosUtxo);
    const data = new TextEncoder().encode(stringify(deployed));
    Deno.writeFileSync(deployDetailsFile, data);
    console.log(`Updated ${deployDetailsFile}`);
    console.log(`eodHash: ${eodHash}`);
    console.log("");
}
await liquidate();
