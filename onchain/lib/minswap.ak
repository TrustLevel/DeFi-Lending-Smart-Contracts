use aiken/crypto.{Blake2b_224, Blake2b_256, Hash, Script, VerificationKey}
use cardano/address.{Address}
use types.{AssetClass}

pub type CustomDatumHash =
  Hash<Blake2b_256, Data>

pub type ValidatorHash =
  Hash<Blake2b_224, Script>

pub type PubKeyHash =
  Hash<Blake2b_224, VerificationKey>

/// `SwapAmountOption` type on [MinSwap V2](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/lib/amm_dex_v2/types.ak#L83)
///
/// Option when someone want to swap a token on MinSwap V2
pub type SwapAmountOption {
  // Swap a specific amount of token
  SAOSpecificAmount { swap_amount: Int }
  // Swap a all amount of the token that is available on the order's value
  // @deducted_amount will be subtract from the amount
  // This option is useful for integration where the creator doesn't know the exact amount that will be swapped
  SAOAll { deducted_amount: Int }
}

/// `OrderStep` type on [MinSwap V2](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/lib/amm_dex_v2/types.ak#L112)
pub type OrderStep {
  // SwapExactIn is used for exchanging specific amount of single asset in the liquidity pool. 
  // The order will be executed if the received amount is greater than or equal to `minimum_receive`.
  SwapExactIn {
    // The AToB direction of swap request. True for A -> B and False for B -> A
    a_to_b_direction: Bool,
    // Amount of Asset In which users want to exchange
    swap_amount_option: SwapAmountOption,
    // Minimum amount of Asset Out which users want to receive after exchanging
    minimum_receive: Int,
    // Decide the Order behavior in case Order is not meet the slippage tolerance
    killable: Bool,
  }
  // StopLoss is used for exchanging specific amount of single asset in the liquidity pool.
  // The order will be executed if the received amount is less than or equal to `stop_loss_receive`
  StopLoss {
    // The AToB direction of swap request. True for A -> B and False for B -> A
    a_to_b_direction: Bool,
    // Amount of Asset In which users want to exchange
    swap_amount_option: SwapAmountOption,
    // Maximum amount of Asset Out which users want to receive after exchanging
    stop_loss_receive: Int,
  }
  // OCO is used for exchanging specific amount of single asset in the liquidity pool.
  // The order will be executed if the received amount is less than or equal to `stop_loss_receive` 
  //    and greater than or equal to `minimum_receive`
  OCO {
    // The AToB direction of swap request. True for A -> B and False for B -> A
    a_to_b_direction: Bool,
    // Amount of Asset In which users want to exchange
    swap_amount_option: SwapAmountOption,
    // Minimum amount of Asset Out which users want to receive after exchanging
    minimum_receive: Int,
    // Maximum amount of Asset Out which users want to receive after exchanging
    stop_loss_receive: Int,
  }
  // SwapExactOut is used for exchanging single asset in the liquidity pool and receiving the exact amout of other asset.
  // The order will be executed if the received amount is equal to `expected_receive`
  SwapExactOut {
    // The AToB direction of swap request. True for A -> B and False for B -> A 
    a_to_b_direction: Bool,
    // Maximum amount of Asset In which users want to exchange
    maximum_swap_amount_option: SwapAmountOption,
    // The exact amount of Asset Out which users want to receive after exchanging
    expected_receive: Int,
    // Decide the Order behavior in case Order is not meet the slippage tolerance
    killable: Bool,
  }
  // (Not Applicable To Us) Deposit is used for depositing pool's assets and receiving LP Token 
  Deposit
  // (Not Applicable To Us) Withdraw is used for withdrawing pool's asset with the exact assets ratio of the liquidity pool at that time
  Withdraw
  // (Not Applicable To Us) ZapOut is used for withdrawing a single pool asset out of Liquidity Pool
  ZapOut
  // (Not Applicable To Us) PartialSwap is used for exchange partial amount of single Asset. 
  // The Partial Swap can be executed multiple time if the price ratio is matched with user's expectation, 
  //   and the time is defined in `hops`
  PartialSwap
  // (Not Applicable To Us) WithdrawImbalance is used for withdrawing custom amount of assets.
  WithdrawImbalance
  // (Not Applicable To Us) SwapMultiRouting is used for exchanging specific amount of single asset across multiple Liquidity Pools.
  SwapMultiRouting
  // (Not Applicable To Us)
  Donation
}

/// `ExtraOrderDatum` type on [MinSwap V2](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/lib/amm_dex_v2/types.ak#L236)
pub type MinswapEOD {
  MinEODNoDatum
  MinEODDatumHash { hash: CustomDatumHash }
  MinEODInlineDatum { hash: CustomDatumHash }
}

/// `OrderAuthorizationMethod` type on [MinSwap V2](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/lib/amm_dex_v2/types.ak#L243)
///
/// Authorization methods for an Order owner to unlock funds from the Order's Utxo
pub type OrderAuthorizationMethod {
  // Requires a signature from a PubKey wallet.
  OAMSignature { pub_key_hash: PubKeyHash }
  // For a Script-based wallet with a Spend method, the associated Utxo must be present in the transaction inputs.
  OAMSpendScript { script_hash: ValidatorHash }
  // For a Script-based wallet with a Withdrawal method, a corresponding withdrawal must be present in the transaction.
  OAMWithdrawScript { script_hash: ValidatorHash }
  // For a Script-based wallet with a Minting method, it must mint tokens with a defined policy ID, included in the transaction minting, with a non-zero quantity.
  OAMMintScript { script_hash: ValidatorHash }
}

/// `OrderDatum` type on [MinSwap V2](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/lib/amm_dex_v2/types.ak#L254)
pub type MinswapOrderDatum {
  // The address's payment credential that can cancel the order, can be PubKey or Script
  canceller: OrderAuthorizationMethod,
  // The address of the output after being killed by Batcher or cancelled by bots (order is expired)
  refund_receiver: Address,
  // The datum hash of the output after being killed by Batcher or cancelled by bots (order is expired)
  refund_receiver_datum: MinswapEOD,
  // The address which receives the funds after order is processed
  success_receiver: Address,
  // The datum hash of the output after order is processed.
  success_receiver_datum: MinswapEOD,
  // The Liquidity Pool's LP Asset that the order will be applied to
  lp_asset: AssetClass,
  // The information about Order Type
  step: OrderStep,
  // The maximum fee users have to pay to Batcher to execute batching transaction
  // The actual fee Batcher will take might be less than the maximum fee
  max_batcher_fee: Int,
  // expiry setting option contain
  // - Order Expired time: If the order is not executed after Expired Time, anyone can help the owner cancel it
  // - Max tip for cancelling expired order
  expiry_setting_opt: Option<(Int, Int)>,
}
