import { 
    AssetClass,
    DatumHashSchema,
    SignerHashSchema,
    AssetClassSchema,
    AddressSchema,
    getLucidInstance,
} from "./common.ts";
import { 
    Data,
    Datum,
    OutRef,
    Assets,
    LucidEvolution
} from "@lucid-evolution/lucid";
import BigNumber from "bignumber.js";

// on-chain constants for minswap v2 on preprod network

export const minswapPoolAddress = "addr_test1zrtt4xm4p84vse3g3l6swtf2rqs943t0w39ustwdszxt3l5rajt8r8wqtygrfduwgukk73m5gcnplmztc5tl5ngy0upqhns793";

// from https://github.com/minswap/sdk/blob/b0b5ea678587f76e257788710e6c9bef69019f96/src/types/constants.ts#L823
export const minswapOrderEnterpAddress = "addr_test1wrdf2f2x8pq3wwk3yv936ksmt59rz94mm66yzge8zj9pk7s0kjph3";

export const minswapOrderScriptHash = "da9525463841173ad1230b1d5a1b5d0a3116bbdeb4412327148a1b7a";

export const minswapBeaconToken: AssetClass = {
    policy_id: "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b",
    asset_name: "4d5350",
};
// LP token for ADA/USDM
export const minswapLpToken: AssetClass = {
    policy_id: "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b",
    asset_name: "9e31ea789e7067d3ea0b557c6b088a896d21e4d88054d7c191d8cd06a8ea8398",
};

export const minswapLpDatumSchema = Data.Object({
    pool_batching_stake_credential: Data.Nullable(
        Data.Enum([
            Data.Object({
                VerificationKey: Data.Object({
                    key_hash: Data.Bytes({ minLength: 28, maxLength: 28 }),
                }),
            }),
            Data.Object({
                Script: Data.Object({
                    key_hash: Data.Bytes({ minLength: 28, maxLength: 28 }),
                }),
            }),
        ]),
    ),
    asset_a: AssetClassSchema,
    asset_b: AssetClassSchema,
    total_liquidity: Data.Integer(),
    reserve_a: Data.Integer(),
    reserve_b: Data.Integer(),
    base_fee_a_numerator: Data.Integer(),
    base_fee_b_numerator: Data.Integer(),
    fee_sharing_numerator_opt: Data.Nullable(Data.Integer()),
    allow_dynamic_fee: Data.Boolean(),
});
export type MinswapLpDatumType = Data.Static<typeof minswapLpDatumSchema>;
export const MinswapLpDatum = minswapLpDatumSchema as unknown as MinswapLpDatumType;


export enum SwapAmountOptionEnum {
    SAOSpecificAmount = "SAOSpecificAmount",
    SAOAll = "SAOAll"
}
export const SwapAmountOptionSchema = Data.Enum([
    Data.Object({
        [SwapAmountOptionEnum.SAOSpecificAmount]: Data.Object({
            swap_amount: Data.Integer(),
        }),
    }),
    Data.Object({
        [SwapAmountOptionEnum.SAOAll]: Data.Object({
            deducted_amount: Data.Integer(),
        }),
    }),
]);
export type SwapAmountOptionType = Data.Static<typeof SwapAmountOptionSchema>;
export const SwapAmountOption = SwapAmountOptionSchema as unknown as SwapAmountOptionType;


export enum OrderStepEnum {
    SwapExactIn = "SwapExactIn",
    SwapExactOut = "SwapExactOut"
}
export const OrderStepSchema = Data.Enum([
    Data.Object({
        [OrderStepEnum.SwapExactIn]: Data.Object({
            a_to_b_direction: Data.Boolean(),
            swap_amount_option: SwapAmountOptionSchema,
            minimum_receive: Data.Integer(),
            killable: Data.Boolean(),
        }),
    }),
    Data.Object({
        [OrderStepEnum.SwapExactOut]: Data.Object({
            a_to_b_direction: Data.Boolean(),
            maximum_swap_amount_option: SwapAmountOptionSchema,
            expected_receive: Data.Integer(),
            killable: Data.Boolean(),
        }),
    }),
]);
export type OrderStepType = Data.Static<typeof OrderStepSchema>;
export const OrderStep = OrderStepSchema as unknown as OrderStepType;


export enum MinswapEODEnum {
    MinEODNoDatum = "MinEODNoDatum",
    MinEODDatumHash = "MinEODDatumHash",
    MinEODInlineDatum = "MinEODInlineDatum"
}
export const MinswapEODSchema = Data.Enum([
    Data.Literal(MinswapEODEnum.MinEODNoDatum),
    Data.Object({
        [MinswapEODEnum.MinEODDatumHash]: Data.Object({
            hash: DatumHashSchema,
        }),
    }),
    Data.Object({
        [MinswapEODEnum.MinEODInlineDatum]: Data.Object({
            hash: DatumHashSchema,
        }),
    }),
]);
export type MinswapEODType = Data.Static<typeof MinswapEODSchema>;
export const MinswapEOD = MinswapEODSchema as unknown as MinswapEODType;


export enum OAMEnum {
    OAMSignature = "OAMSignature",
    OAMSpendScript = "OAMSpendScript",
    OAMWithdrawScript = "OAMWithdrawScript",
    OAMMintScript = "OAMMintScript"
}
export const OrderAuthorizationMethodSchema = Data.Enum([
    Data.Object({
        [OAMEnum.OAMSignature]: Data.Object({
            pub_key_hash: SignerHashSchema,
        }),
    }),
    Data.Object({
        [OAMEnum.OAMSpendScript]: Data.Object({
            script_hash: SignerHashSchema,
        }),
    }),
    Data.Object({
        [OAMEnum.OAMWithdrawScript]: Data.Object({
            script_hash: SignerHashSchema,
        }),
    }),
    Data.Object({
        [OAMEnum.OAMMintScript]: Data.Object({
            script_hash: SignerHashSchema,
        }),
    }),
]);
export type OrderAuthorizationMethodType = Data.Static<typeof OrderAuthorizationMethodSchema>;
export const OrderAuthorizationMethod = OrderAuthorizationMethodSchema as unknown as OrderAuthorizationMethodType;


export const minswapOrderDatumSchema = Data.Object({
    canceller: OrderAuthorizationMethodSchema,
    refund_receiver: AddressSchema,
    refund_receiver_datum: MinswapEODSchema,
    success_receiver: AddressSchema,
    success_receiver_datum: MinswapEODSchema,
    lp_asset: AssetClassSchema,
    step: OrderStepSchema,
    max_batcher_fee: Data.Integer(),
    expiry_setting_opt: Data.Nullable(
        Data.Tuple([Data.Integer(), Data.Integer()])
    ),
});
export type MinswapOrderDatumType = Data.Static<typeof minswapOrderDatumSchema>;
export const MinswapOrderDatum = minswapOrderDatumSchema as unknown as MinswapOrderDatumType;

export function makeMinswapOrderDatum(obj: MinswapOrderDatumType): Datum {
    const minswapOrderDatumData: Datum = Data.to(obj, MinswapOrderDatum);
    return minswapOrderDatumData;
}


export enum MsOrderRedeemerEnum {
    ApplyOrder = "ApplyOrder",
    CancelOrderByOwner = "CancelOrderByOwner",
    CancelExpiredOrderByAnyone = "CancelExpiredOrderByAnyone",
}
export const MsOrderRedeemerSchema = Data.Enum([
    Data.Literal(MsOrderRedeemerEnum.ApplyOrder),
    Data.Literal(MsOrderRedeemerEnum.CancelOrderByOwner),
    Data.Literal(MsOrderRedeemerEnum.CancelExpiredOrderByAnyone)
]);
export type MsOrderRedeemerType = Data.Static<typeof MsOrderRedeemerSchema>;
export const MsOrderRedeemer = MsOrderRedeemerSchema as unknown as MsOrderRedeemerType;


export async function getPoolByLpToken(lpToken: AssetClass, lucidInst?: LucidEvolution) {
    const lucid = lucidInst ?? getLucidInstance();
    const tusdLpToken = lpToken.policy_id + lpToken.asset_name;
    const dexPoolUtxos = await lucid.utxosAtWithUnit(minswapPoolAddress, tusdLpToken);
    const tusdPoolUtxo = dexPoolUtxos.find((utxo) => {
        if (utxo.assets[minswapBeaconToken.policy_id + minswapBeaconToken.asset_name]) return true;
        else return false;
    })!;
    const msLpDatum = Data.from(tusdPoolUtxo.datum!, MinswapLpDatum);
    return msLpDatum;
}

// from https://github.com/minswap/sdk/blob/b0b5ea678587f76e257788710e6c9bef69019f96/src/types/pool.ts#L278
export const MS_DEFAULT_TRADING_FEE_DENOMINATOR = 10000n;

export type CalculateAmountOutParams = {
    reserveIn: bigint;
    reserveOut: bigint;
    amountIn: bigint;
    tradingFeeNumerator: bigint;
}
export function calculateAmountOut({
    reserveIn,
    reserveOut,
    amountIn,
    tradingFeeNumerator,
}: CalculateAmountOutParams): bigint {
    const diff = MS_DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator;
    const inWithFee = diff * amountIn;
    const numerator = inWithFee * reserveOut;
    const denominator = MS_DEFAULT_TRADING_FEE_DENOMINATOR * reserveIn + inWithFee;
    return numerator / denominator;
}


/**
 * Options to calculate amount with slippage tolerance up or down
 * @slippageTolerancePercent The slippage tolerance percent
 * @amount The amount that we want to calculate
 * @type The type of slippage tolerance, up or down
 */
export type CalcSwapExactOutWithSlippageOptions = {
  slippageTolerancePercent: number;
  amount: bigint;
  type: "up" | "down";
};
export function calcAmtWithSlippage(
  options: CalcSwapExactOutWithSlippageOptions
): bigint {
  const { slippageTolerancePercent, amount, type } = options;
  const slippageTolerance = new BigNumber(slippageTolerancePercent).div(100);
  return applySlippage({
    slippage: slippageTolerance,
    amount: amount,
    type: type,
  });
}

// from https://github.com/minswap/sdk/blob/b0b5ea678587f76e257788710e6c9bef69019f96/src/utils/slippage.internal.ts#L4
export function applySlippage({
    slippage,
    amount,
    type,
}: {
    slippage: BigNumber;
    amount: bigint;
    type: "up" | "down";
}): bigint {
    switch (type) {
        case "up": {
            const slippageAdjustedAmount = new BigNumber(1).plus(slippage).multipliedBy(amount.toString());
            return BigInt(slippageAdjustedAmount.toFixed(0, BigNumber.ROUND_DOWN));
        }
        case "down": {
            const slippageAdjustedAmount = new BigNumber(1)
                .div(new BigNumber(1).plus(slippage))
                .multipliedBy(amount.toString());
            return BigInt(slippageAdjustedAmount.toFixed(0, BigNumber.ROUND_DOWN));
        }
    }
}
