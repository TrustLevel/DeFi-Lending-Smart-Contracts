//// This module contains all the supporting functions that are used by the validator scripts
//// that compose the lending protocol.

use aiken/builtin.{multiply_integer, quotient_integer, serialise_data}
use aiken/collection/dict.{find, size}
use aiken/collection/list
use aiken/crypto.{ScriptHash, blake2b_256, sha3_256}
use aiken/math.{pow}
use aiken/primitive/bytearray.{concat}
use aiken/primitive/string
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{
  AssetName, PolicyId, Value, from_asset, lovelace_of, match, merge, negate,
  quantity_of, tokens,
}
use cardano/transaction.{
  Datum, InlineDatum, Input, Output, OutputReference, Transaction, ValidityRange,
}
use constants.{
  audit_token, global_cfg_token, oracle_cfg_token, oracle_price_token,
}
use minswap.{MinEODDatumHash, MinswapOrderDatum, OAMSignature}
use types.{
  AssetClass, AuditDatum, Available, BorrowProcess, CfgGlobal, CfgOracle,
  CollateralDatum, CommonUtxos, GlobalSettings, LendingPoolDatum, LiquidationDex,
  LoanDatum, LoanIssued, LoanRequest, LoanRequested, Minswap, OracleDatum,
  OracleSettings, PositionRegistryDatum, ProtocolInputs, QuotePrice,
  RepayProcess, RepayRequested, SettingsDatum, SettleLiquidation, Signer,
  UnifiedRedeemer,
}
use utils.{get_lower_bound, get_upper_bound}

// ## Common

/// Get the global settings from the given list of tx reference inputs, the index of the settings UTXO, and the policy ID of the settings beacon token.
pub fn get_gcfg(
  inputs: List<Input>,
  cfg_input_idx: Int,
  cfg_policy: PolicyId,
) -> CfgGlobal {
  expect Some(cfg_input) = list.at(inputs, cfg_input_idx)
  expect quantity_of(cfg_input.output.value, cfg_policy, global_cfg_token) == 1
  get_global_settings_from_input(cfg_input)
}

/// Get the global settings from the datum of the given settings UTXO.
pub fn get_global_settings_from_input(cfg_input: Input) -> CfgGlobal {
  expect InlineDatum(inline_datum) = cfg_input.output.datum
  expect settings_datum: SettingsDatum = inline_datum
  when settings_datum is {
    GlobalSettings {
      admin_key_hash,
      audit_contract,
      pool_contract,
      oracle_contract,
      registry_contract,
      collateral_contract,
      collateral_ratio,
      max_tx_validity,
      liquidation_dexes,
    } ->
      CfgGlobal {
        admin_key_hash,
        audit_contract,
        pool_contract,
        oracle_contract,
        registry_contract,
        collateral_contract,
        collateral_ratio,
        max_tx_validity,
        liquidation_dexes,
      }
    _ -> fail @"Invalid global settings datum"
  }
}

/// Get the oracle settings from the datum of the given oracle settings UTXO.
pub fn get_oracle_settings_from_input(cfg_input: Input) -> CfgOracle {
  expect InlineDatum(inline_datum) = cfg_input.output.datum
  expect settings_datum: SettingsDatum = inline_datum
  when settings_datum is {
    OracleSettings { oracle_contract, providers } ->
      CfgOracle { oracle_contract, providers }
    _ -> fail @"Invalid oracle settings datum"
  }
}

/// Downcast a given collateral utxo datum into `CollateralDatum` type.
/// Returns `None` when the given datum is not an `InlineDatum` type, or if it doesn't have the `CollateralDatum` structure.
pub fn get_collateral_datum(datum: Datum) -> Option<CollateralDatum> {
  when datum is {
    InlineDatum(collateral_datum) ->
      if collateral_datum is collateral_utxo_datum: CollateralDatum {
        Some(collateral_utxo_datum)
      } else {
        None
      }
    _ -> None
  }
}

/// Downcast a given registry utxo datum into `PositionRegistryDatum` type.
/// Returns `None` when the given datum is not an `InlineDatum` type, or if it doesn't have the `PositionRegistryDatum` structure.
pub fn get_registry_datum(datum: Datum) -> Option<PositionRegistryDatum> {
  when datum is {
    InlineDatum(registry_datum) ->
      if registry_datum is registry_utxo_datum: PositionRegistryDatum {
        Some(registry_utxo_datum)
      } else {
        None
      }
    _ -> None
  }
}

/// Check if a given input contains 1 and only 1 position token, and return the result 
/// together with the position token name.
pub fn get_pos_token_name_from_input(
  input: Input,
  policy_id: PolicyId,
) -> (Bool, AssetName) {
  let position_tokens = tokens(input.output.value, policy_id)
  let pos_tokens_count = size(position_tokens)
  let pos_token = find(position_tokens, 1)
  when pos_token is {
    Some(token_name) ->
      if pos_tokens_count == 1 {
        (True, token_name)
      } else {
        (False, "")
      }
    None -> (False, "")
  }
}

/// Check if a given input contains 1 and only 1 position token, and that it is the given asset class.
pub fn validate_input_w_pos_token(
  input: Input,
  policy_id: PolicyId,
  asset_name: AssetName,
) -> Bool {
  let position_tokens_count = tokens(input.output.value, policy_id) |> size()
  let position_token_qty =
    quantity_of(input.output.value, policy_id, asset_name)
  let input_has_valid_pos_token = and {
      1 == position_tokens_count,
      1 == position_token_qty,
    }
  input_has_valid_pos_token
}

/// Read oracle data from a given oracle input. Checks for the following:
/// 1. That the given UTXO contains the official _oracle price_ beacon token.
/// 1. That the quoted asset and denomination are as expected, and 
/// 1. That the data age is within the validity period setting
pub fn read_oracle_data(
  oracle_input: Input,
  quoted_asset: AssetClass,
  denomination: AssetClass,
  tx_validity_range: ValidityRange,
  beacon_policy_id: PolicyId,
) -> (QuotePrice, Bool) {
  expect InlineDatum(inline_datum) = oracle_input.output.datum
  expect oracle_datum: OracleDatum = inline_datum
  expect
    quantity_of(oracle_input.output.value, beacon_policy_id, oracle_price_token) == 1
  let OracleDatum {
    timestamp,
    validity_period,
    quoted_asset: o_qted_asset,
    denomination: o_denom,
    price,
    ..
  } = oracle_datum
  let data_valid_until = timestamp + validity_period
  let tx_valid_from = get_lower_bound(tx_validity_range)
  let is_valid = and {
      (o_qted_asset == quoted_asset)?,
      (o_denom == denomination)?,
      (data_valid_until >= tx_valid_from)?,
    }
  (price, is_valid)
}

/// Calculate the amount of loanable asset that a user can borrow, given their collateral asset amount.
/// This takes into account the price of the collateral asset to determine its value, and then applies 
/// the loan-to-value ratio to arrive at the amount the user can borrow.
pub fn calc_amt_user_can_borrow(
  collateral_amt: Int,
  collateral_ratio: Int,
  quote_price: QuotePrice,
) -> Int {
  let price = quote_price.1st
  let decimals = quote_price.2nd
  let price_denom = pow(10, decimals)
  let collateral_value =
    multiply_integer(collateral_amt, price) |> quotient_integer(price_denom)

  multiply_integer(collateral_value, collateral_ratio)
    |> quotient_integer(100)
}

/// Check if the given transaction validity range is within the pre-specified limit.
///
/// This is required for determining the maturity date of a loan. This is also used as basis
/// for determining the time of repayment, in the case of loan repayment transactions.
pub fn validate_tx_validity_range(
  range: ValidityRange,
  max_tx_validity: Int,
) -> Bool {
  // let max_period: Int = 7_200_000
  let tx_validity_period = get_upper_bound(range) - get_lower_bound(range)
  tx_validity_period <= max_tx_validity
}

// ## Settings

/// Check the given input against the given output if the assets are returned to the same address.
/// Only the tokens are checked for equality. The lovelace amount in the output is allowed to be greater or less than
/// in the input since only the minAda is expected here and in this case, it depends on the size of the datum.
pub fn is_cfg_utxo_returned(input: Input, output: Output) -> Bool {
  let values_match =
    match(
      input.output.value,
      output.value,
      fn(input_ada, output_ada) {
        or {
          input_ada >= output_ada,
          input_ada <= output_ada,
        }
      },
    )
  let is_returned = input.output.address == output.address
  and {
    values_match,
    is_returned,
  }
}

/// Check if the given value contains minted beacon tokens `global_cfg_token`, `oracle_cfg_token`, and `audit_token`.
pub fn are_cfg_beacons_minted(minted: Value, policy_id: PolicyId) -> Bool {
  and {
    1 == quantity_of(minted, policy_id, global_cfg_token),
    1 == quantity_of(minted, policy_id, oracle_cfg_token),
    1 == quantity_of(minted, policy_id, audit_token),
  }
}

/// Check if the given value contains burned beacon tokens `global_cfg_token`, `oracle_cfg_token`, and `audit_token`.
pub fn are_cfg_beacons_burned(burned: Value, policy_id: PolicyId) -> Bool {
  and {
    -1 == quantity_of(burned, policy_id, global_cfg_token),
    -1 == quantity_of(burned, policy_id, oracle_cfg_token),
    -1 == quantity_of(burned, policy_id, audit_token),
  }
}

// ## Collateral

/// Parse collateral datum from given raw Data.
pub fn get_collateral_datum_from_input(
  input: Input,
) -> (ByteArray, CollateralDatum) {
  expect InlineDatum(inline_datum) = input.output.datum
  expect collateral_datum: CollateralDatum = inline_datum
  let owner_hash =
    when collateral_datum.owner.payment_credential is {
      VerificationKey(key_hash) -> key_hash
      Script(script_hash) -> script_hash
    }
  (owner_hash, collateral_datum)
}

/// From a given [`CollateralDatum`](./types.html#CollateralDatum), check if it is used in an active loan.
pub fn is_collateral_locked(datum: CollateralDatum) -> Bool {
  when datum.status is {
    Available -> False
    LoanRequested { .. } -> False
    _ -> True
  }
}

/// Check the collateral output when submitting a loan request, for the following:
/// 1. That the datum is correctly updated with the status [`LoanRequested`](./types.html#CollateralStatus) and contains the loan request datum ([`LoanDatum`](./types.html#LoanDatum)).
/// 1. That the collateral amount locked is at the very least, the same as the input
pub fn validate_collateral_output_for_loan_req(
  output: Output,
  input: Input,
  input_datum: CollateralDatum,
  borrowed_amt: Int,
  loan_term: Int,
  loan_asset: AssetClass,
) -> Bool {
  let values_match = match(output.value, input.output.value, >=)
  let loan_req =
    LoanRequest { borrowed_asset: loan_asset, borrowed_amt, loan_term }
  let expected_datum =
    CollateralDatum {
      owner: input_datum.owner,
      collateral_asset: input_datum.collateral_asset,
      status: LoanRequested { request: loan_req },
    }
  expect Some(output_datum) = get_collateral_datum(output.datum)
  let datums_match = output_datum == expected_datum

  let collateral_is_returned = output.address == input.output.address

  and {
    values_match?,
    datums_match?,
    collateral_is_returned?,
  }
}

/// Check the collateral output when submitting a loan _repayment_ request, for the following:
/// 1. That the datum contains the correctly updated status [`RepayRequested`](./types.html#CollateralStatus)
/// 1. That the utxo contains both the collateral amount from the input, and the repayment asset in the correct amount.
pub fn validate_collateral_output_for_repayment_req(
  collateral_output: Output,
  collateral_input: Input,
  registry_input: Input,
) -> Bool {
  let input_value = collateral_input.output.value
  expect Some(registry_datum) = get_registry_datum(registry_input.output.datum)
  let loan = registry_datum.loan
  let expected_repayment_amt = loan.borrowed_amt + loan.interest_amt
  let repayment_value =
    from_asset(
      loan.borrowed_asset.policy_id,
      loan.borrowed_asset.asset_name,
      expected_repayment_amt,
    )
  let expected_output_value = merge(input_value, repayment_value)
  let values_match = match(collateral_output.value, expected_output_value, >=)
  expect Some(input_datum) = get_collateral_datum(collateral_input.output.datum)
  let expected_datum = CollateralDatum { ..input_datum, status: RepayRequested }
  expect Some(output_datum) = get_collateral_datum(collateral_output.datum)
  let datums_match = output_datum == expected_datum
  and {
    values_match?,
    datums_match?,
  }
}

/// Check if the given loan position is either undercollateralized or overdue.
pub fn is_for_liquidation(
  loan: LoanDatum,
  collateral_ratio: Int,
  price: QuotePrice,
  tx_validity_range: ValidityRange,
) -> Bool {
  let LoanDatum { collateral_amt, borrowed_amt, maturity, .. } = loan
  let loanable_amt =
    calc_amt_user_can_borrow(collateral_amt, collateral_ratio, price)
  let is_undercollateralized = loanable_amt < borrowed_amt
  let liquidation_time = get_lower_bound(tx_validity_range)
  let is_overdue = liquidation_time > maturity
  or {
    is_undercollateralized,
    is_overdue,
  }
}

/// Check the given output for the following:
/// 1. That the address is one of the supported dexes' order contract
/// 1. That the datum is as expected
pub fn validate_dex_output(
  cfg: CfgGlobal,
  dex: LiquidationDex,
  dex_output: Output,
  registry_output: Output,
  collateral_asset: AssetClass,
  collateral_amt: Int,
) -> Bool {
  expect Script(dex_hash) = dex_output.address.payment_credential
  expect InlineDatum(inline_datum) = dex_output.datum
  let dex_valid = list.has(cfg.liquidation_dexes, dex)
  let output_valid =
    when dex is {
      Minswap { order_contract } -> {
        let address_valid = dex_hash == order_contract
        expect order_datum: MinswapOrderDatum = inline_datum
        expect Some(registry_datum) = get_registry_datum(registry_output.datum)
        let order_datum_valid =
          validate_minswap_order_datum(order_datum, registry_datum, cfg)
        let collateral_is_swapped =
          quantity_of(
            dex_output.value,
            collateral_asset.policy_id,
            collateral_asset.asset_name,
          ) >= collateral_amt
        and {
          address_valid?,
          order_datum_valid?,
          collateral_is_swapped?,
        }
      }
      _ -> fail @"dex not yet supported"
    }
  and {
    dex_valid?,
    output_valid?,
  }
}

/// Check the given Minswap order datum for the following:
/// 1. That the canceller is the admin, to be sure the swap order can be cancelled if needed
/// 1. That the refund and success receivers are the collateral contract
/// 1. That the Extra Order Datum (EOD) contains the hash of the position token name
pub fn validate_minswap_order_datum(
  order_datum: MinswapOrderDatum,
  registry_datum: PositionRegistryDatum,
  cfg: CfgGlobal,
) -> Bool {
  let MinswapOrderDatum {
    canceller,
    refund_receiver,
    refund_receiver_datum,
    success_receiver,
    success_receiver_datum,
    ..
  } = order_datum

  // check that the canceller is the liquidator
  expect OAMSignature { pub_key_hash: canceller_hash } = canceller
  let admin_is_canceller = canceller_hash == cfg.admin_key_hash

  // check that the refund and success receiver is the collateral contract
  let refund_receiver_valid =
    refund_receiver.payment_credential == Script(cfg.collateral_contract)
  let success_receiver_valid =
    success_receiver.payment_credential == Script(cfg.collateral_contract)

  // check that the Extra Order Datum (EOD) contains the hash of the position token name
  let custom_datum_hash = blake2b_256(serialise_data(registry_datum))
  let expected_eod = MinEODDatumHash { hash: custom_datum_hash }
  let refund_eod_valid = expected_eod == refund_receiver_datum
  let success_eod_valid = expected_eod == success_receiver_datum
  and {
    admin_is_canceller?,
    refund_receiver_valid?,
    success_receiver_valid?,
    refund_eod_valid?,
    success_eod_valid?,
  }
}

/// When liquidating a position, check the given `registry` output for the following:
/// 1. That the position token pair is sent back to the position registry contract
/// 1. That the datum is updated with the liquidator's hash
pub fn validate_liquidation_registry_output(
  output: Output,
  input: Input,
  pool_contract: ScriptHash,
  pos_token: AssetName,
  liquidator: Signer,
) -> Bool {
  let pos_token_count_valid =
    quantity_of(output.value, pool_contract, pos_token) == 2

  expect InlineDatum(inline_datum) = input.output.datum
  expect input_reg_datum: PositionRegistryDatum = inline_datum
  let expected_output_datum =
    PositionRegistryDatum { ..input_reg_datum, liquidator: Some(liquidator) }
  let datums_match = output.datum == InlineDatum(expected_output_datum)
  let value_returned = output.address == input.output.address

  and {
    pos_token_count_valid?,
    datums_match?,
    value_returned?,
  }
}

// ## Position Registry

/// From the given `Transaction`, check the given indeces for the `registry` and `collateral` input UTXOs; 
/// confirm that the `registry` input matches with the given _output reference_; and then finally, check
/// that the `collateral` input contains the same position token that the `registry` input has.
pub fn validate_collateral_registry_inputs_match(
  tx: Transaction,
  reg_input_idx: Int,
  collat_input_idx: Int,
  lp_contract: ScriptHash,
  output_ref: OutputReference,
) -> Bool {
  expect Some(registry_input) = list.at(tx.inputs, reg_input_idx)
  expect registry_input.output_reference == output_ref
  let (_pos_token_count_valid, pos_token) =
    get_pos_token_name_from_input(registry_input, lp_contract)
  // The correct collateral UTXO must be one of the inputs.
  // collateral input must also contain exactly 1 of the same position token
  // contained in the registry input
  expect Some(collateral_input) = list.at(tx.inputs, collat_input_idx)
  validate_input_w_pos_token(collateral_input, lp_contract, pos_token)
}

// ## Oracle

/// Get the oracle settings from the given list of tx inputs, the index of the oracle settings UTXO, and the policy ID of the settings beacon token.
pub fn get_ocfg(
  inputs: List<Input>,
  cfg_input_idx: Int,
  cfg_policy: PolicyId,
) -> CfgOracle {
  expect Some(cfg_input) = list.at(inputs, cfg_input_idx)
  expect quantity_of(cfg_input.output.value, cfg_policy, oracle_cfg_token) == 1
  get_oracle_settings_from_input(cfg_input)
}

/// Check the oracle output when updating oracle price UTXO, for the following:
/// 1. That the datum is of the expected structure
/// 1. That the output goes back to the oracle contract
/// 1. That the value is the same as in the input
pub fn validate_oracle_price_output(input: Input, output: Output) -> Bool {
  expect InlineDatum(output_datum) = output.datum
  let output_datum_valid =
    if output_datum is OracleDatum {
      True
    } else {
      False
    }
  let output_value_valid = match(output.value, input.output.value, >=)
  let utxo_returned = output.address == input.output.address
  and {
    utxo_returned?,
    output_value_valid?,
    output_datum_valid?,
  }
}

// ## Lending Pool

/// Check the collateral input when fulfilling a loan request, for the following:
/// 1. That the input does come from the collateral contract
/// 1. That the datum contains the status: [`LoanRequested`](./types.html#CollateralStatus)
pub fn validate_collateral_input_for_loan_proc(
  input: Input,
  collateral_contract: ScriptHash,
  loanable_asset: AssetClass,
) -> (Bool, Address, LoanRequest) {
  expect Some(collateral_input_datum) = get_collateral_datum(input.output.datum)
  let loan_req =
    when collateral_input_datum.status is {
      LoanRequested { request } -> request
      _ -> fail @"Invalid collateral input datum"
    }
  let is_valid =
    when input.output.address.payment_credential is {
      Script(hash) -> and {
          hash == collateral_contract,
          loan_req.borrowed_asset == loanable_asset,
        }
      _ -> False
    }
  (is_valid, collateral_input_datum.owner, loan_req)
}

/// Check the collateral input when fulfilling a repayment request, for the following:
/// 1. That the input does come from the collateral contract
/// 1. That the datum contains the status: [`RepayRequested`](./types.html#CollateralStatus)
/// 1. That the input contains 1 and only 1 position token
pub fn validate_collateral_input_for_repayment_proc(
  input: Input,
  global_cfg: CfgGlobal,
) -> (Bool, Address, AssetName) {
  let CfgGlobal { pool_contract, collateral_contract, .. } = global_cfg
  expect Some(collateral_input_datum) = get_collateral_datum(input.output.datum)
  let (pos_token_count_valid, pos_token) =
    get_pos_token_name_from_input(input, pool_contract)
  let is_valid =
    when input.output.address.payment_credential is {
      Script(hash) -> {
        let credential_valid = hash == collateral_contract
        let status_valid =
          when collateral_input_datum.status is {
            RepayRequested -> True
            _ -> False
          }
        and {
          pos_token_count_valid,
          credential_valid,
          status_valid,
        }
      }
      _ -> False
    }
  (is_valid, collateral_input_datum.owner, pos_token)
}

/// Check the collateral output when fulfilling a loan request, for the following:
/// 1. That the datum contains the correctly updated status: [`LoanIssued`](./types.html#CollateralStatus)
/// 1. That the value locked in the collateral UTXO now includes one of the position token pair on top of the input value.
/// 1. That the collateral UTXO is returned to the `collateral` contract.
pub fn validate_collateral_output_for_loan_proc(
  output: Output,
  input: Input,
  owner: Address,
  collateral_asset: AssetClass,
  pool_contract: ScriptHash,
  position_token: AssetName,
) -> Bool {
  expect Some(output_datum) = get_collateral_datum(output.datum)
  let expected_output_datum =
    CollateralDatum { owner, collateral_asset, status: LoanIssued }
  let collateral_output_datum_valid = output_datum == expected_output_datum

  let expected_output_value =
    from_asset(pool_contract, position_token, 1) |> merge(input.output.value)
  let collateral_output_value_valid =
    match(output.value, expected_output_value, >=)

  let collateral_is_returned = output.address == input.output.address

  // trace @"Expected: "
  // trace @"owner ": owner
  // trace @"status ": expected_output_datum.status
  // trace @"value ": expected_output_value
  // trace @""
  // trace @"Actual: "
  // trace @"owner ": output_datum.owner
  // trace @"status ": output_datum.status
  // trace @"value ": output.value
  // trace @""
  //
  and {
    collateral_output_datum_valid?,
    collateral_output_value_valid?,
    collateral_is_returned?,
  }
}

/// Check the collateral output when fulfilling a loan _repayment_ request, for the following:
/// 1. That the output does go back to the collateral contract
/// 1. That the datum is correctly updated with the status [`Available`](./types.html#CollateralStatus)
/// 1. That the value contained in the utxo is as expected.
pub fn validate_collateral_output_for_repayment_proc(
  input: Input,
  output: Output,
  owner: Address,
  collateral_asset: AssetClass,
) -> Bool {
  let input_lovelace = lovelace_of(input.output.value)
  let output_lovelace = lovelace_of(output.value)
  let input_collateral_amt =
    get_collateral_amt_in_output(input.output, collateral_asset)
  let output_collateral_amt =
    get_collateral_amt_in_output(output, collateral_asset)
  let expected_datum =
    CollateralDatum { owner, collateral_asset, status: Available }
  expect Some(output_datum) = get_collateral_datum(output.datum)

  // trace @"input_lovelace       ": input_lovelace
  // trace @"output_lovelace      ": output_lovelace
  // trace @"input_collateral_amt ": input_collateral_amt
  // trace @"output_collateral_amt": output_collateral_amt
  //
  let lovelace_amts_match = output_lovelace == input_lovelace
  let collateral_amts_match = output_collateral_amt == input_collateral_amt
  let datums_match = output_datum == expected_datum

  let collateral_is_returned = output.address == input.output.address

  and {
    lovelace_amts_match?,
    collateral_amts_match?,
    datums_match?,
    collateral_is_returned?,
  }
}

/// Check the new lending pool output for the following:
/// 1. That the amount of loanable asset contained in the utxo is as expected
/// 1. That there is no change in the datum
pub fn validate_lending_pool_output(
  input: Input,
  output: Output,
  pool_datum: LendingPoolDatum,
  borrowed_amt: Int,
  interest_amt: Option<Int>,
  redeemer: UnifiedRedeemer,
) -> Bool {
  let AssetClass {
    policy_id: loanable_asset_policy,
    asset_name: loanable_asset_name,
  } = pool_datum.loanable_asset
  let reserve_amt_input =
    input.output.value
      |> quantity_of(loanable_asset_policy, loanable_asset_name)
  let expected_reserve_amt_output =
    when redeemer is {
      BorrowProcess { .. } -> reserve_amt_input - borrowed_amt
      RepayProcess { .. } | SettleLiquidation { .. } -> {
        expect Some(interest_amt) = interest_amt
        reserve_amt_input + borrowed_amt + interest_amt
      }
      _ -> reserve_amt_input
    }

  // trace @"reserve_amt_input          ": reserve_amt_input
  // let reserve_amt_output = quantity_of(output.value, loanable_asset_policy, loanable_asset_name)
  // trace @"reserve_amt_output         ": reserve_amt_output
  // trace @"expected_reserve_amt_output": expected_reserve_amt_output
  //
  // loanable asset only:
  let reserve_input_value =
    from_asset(loanable_asset_policy, loanable_asset_name, reserve_amt_input)
  let expected_reserve_output_value =
    from_asset(
      loanable_asset_policy,
      loanable_asset_name,
      expected_reserve_amt_output,
    )

  // loanable asset + lovelace + other assets that may be in the input:
  let expected_output_value =
    reserve_input_value
      |> negate()
      |> merge(input.output.value)
      |> merge(expected_reserve_output_value)

  let pool_values_match = match(output.value, expected_output_value, >=)

  expect Some(pool_output_datum) = get_lending_pool_datum(output.datum)
  let pool_datum_unchanged = pool_output_datum == pool_datum

  let reserve_is_returned = output.address == input.output.address

  and {
    pool_values_match?,
    pool_datum_unchanged?,
    reserve_is_returned?,
  }
}

/// From a given list of tx inputs, get the ones that come from the protocol contracts and then
/// check that there's only one UTXO coming from each, in order to avoid double-satisfaction exploits.
pub fn validate_protocol_inputs_count(
  redeemer: UnifiedRedeemer,
  inputs: List<Input>,
  global_cfg: CfgGlobal,
) -> Bool {
  let CfgGlobal { pool_contract, registry_contract, collateral_contract, .. } =
    global_cfg
  let inputs_count =
    count_protocol_inputs(
      inputs,
      collateral_contract,
      registry_contract,
      pool_contract,
    )
  when redeemer is {
    BorrowProcess { .. } -> and {
        (1 == inputs_count.collateral)?,
        (1 == inputs_count.lending_pool)?,
        (0 == inputs_count.registry)?,
      }
    RepayProcess { .. } | SettleLiquidation { .. } -> and {
        (1 == inputs_count.collateral)?,
        (1 == inputs_count.lending_pool)?,
        (1 == inputs_count.registry)?,
      }
    _ -> False
  }
}

/// Check that when fulfilling a loan request, the position utxo created at the registry contract 
/// contains one of the position token pair, and has the expected datum.
pub fn validate_registry_output_for_loan_proc(
  output: Output,
  owner: Address,
  collateral_amt: Int,
  loan_req: LoanRequest,
  pool_datum: LendingPoolDatum,
  global_cfg: CfgGlobal,
  position_token: AssetName,
  tx_validity_range: ValidityRange,
) -> Bool {
  let LendingPoolDatum { loanable_asset, collateral_asset, interest_rates } =
    pool_datum
  let CfgGlobal { pool_contract, registry_contract, .. } = global_cfg

  expect Some(interest_tuple) =
    list.find(
      interest_rates,
      fn(rate_tuple) { rate_tuple.1st == loan_req.loan_term },
    )
  let interest_rate = interest_tuple.2nd
  let interest_amt =
    multiply_integer(loan_req.borrowed_amt, interest_rate)
      |> quotient_integer(100)
  let loan_start_time = get_upper_bound(tx_validity_range)
  let maturity = loan_start_time + loan_req.loan_term
  let loan =
    LoanDatum {
      collateral_asset,
      borrowed_asset: loanable_asset,
      collateral_amt,
      borrowed_amt: loan_req.borrowed_amt,
      interest_amt,
      loan_term: loan_req.loan_term,
      maturity,
    }
  expect Some(output_datum) = get_registry_datum(output.datum)
  let expected_output_datum =
    PositionRegistryDatum {
      borrower: owner,
      loan,
      pos_id: position_token,
      liquidator: None,
    }
  let registry_output_datum_valid = output_datum == expected_output_datum
  let expected_output_value = from_asset(pool_contract, position_token, 1)
  let registry_output_value_valid =
    match(output.value, expected_output_value, >=)
  let registry_output_addr_valid =
    Script(registry_contract) == output.address.payment_credential
  and {
    registry_output_value_valid?,
    registry_output_datum_valid?,
    registry_output_addr_valid?,
  }
}

/// From a given list of inputs, count the ones coming from each of the protocol's component contracts.
pub fn count_protocol_inputs(
  inputs: List<Input>,
  collateral_contract: ScriptHash,
  registry_contract: ScriptHash,
  pool_contract: ScriptHash,
) -> ProtocolInputs {
  list.foldl(
    inputs,
    ProtocolInputs { collateral: 0, registry: 0, lending_pool: 0 },
    fn(input, accum) {
      when input.output.address.payment_credential is {
        Script(script_hash) ->
          if script_hash == collateral_contract {
            ProtocolInputs { ..accum, collateral: accum.collateral + 1 }
          } else if script_hash == registry_contract {
            ProtocolInputs { ..accum, registry: accum.registry + 1 }
          } else if script_hash == pool_contract {
            ProtocolInputs { ..accum, lending_pool: accum.lending_pool + 1 }
          } else {
            accum
          }
        _ -> accum
      }
    },
  )
}

/// Get the UTXOs needed by `lending_pool` spend validator that are common among multiple redeemer cases
pub fn get_common_utxos(
  tx: Transaction,
  collateral_idxs: (Int, Int),
  pool_idxs: (Int, Int),
  output_ref: OutputReference,
) -> CommonUtxos {
  expect Some(collateral_input) = list.at(tx.inputs, collateral_idxs.1st)
  expect Some(collateral_output) = list.at(tx.outputs, collateral_idxs.2nd)
  expect Some(pool_input) = list.at(tx.inputs, pool_idxs.1st)
  expect Some(pool_output) = list.at(tx.outputs, pool_idxs.2nd)
  expect pool_input.output_reference == output_ref

  CommonUtxos { collateral_input, collateral_output, pool_input, pool_output }
}

/// Compute the position_token name from a given collateral input.
pub fn calc_position_token_name(collateral_input: Input) -> ByteArray {
  let input_tx_hash = collateral_input.output_reference.transaction_id
  let input_tx_idx =
    string.from_int(collateral_input.output_reference.output_index)
      |> string.to_bytearray()
  concat(input_tx_hash, input_tx_idx) |> sha3_256()
}

/// Downcast a given lending pool datum into [LendingPoolDatum](./types.html#LendingPoolDatum) type.
/// Returns `None` when the given datum is not an `InlineDatum` type, or if it doesn't have the `LendingPoolDatum` structure.
pub fn get_lending_pool_datum(datum: Datum) -> Option<LendingPoolDatum> {
  when datum is {
    InlineDatum(pool_datum) ->
      if pool_datum is lp_datum: LendingPoolDatum {
        Some(lp_datum)
      } else {
        None
      }
    _ -> None
  }
}

/// Get the amount of the collateral asset contained in a given output.
pub fn get_collateral_amt_in_output(
  output: Output,
  collateral_asset: AssetClass,
) -> Int {
  quantity_of(
    output.value,
    collateral_asset.policy_id,
    collateral_asset.asset_name,
  )
}

// ## Audit

/// Check the datum in the given `audit` output for the following:
/// 1. That the `timestamp` is later than the timestamp in the input datum
/// 1. That the `collateral_asset` indicated matches with the one in the lending_pool datum
/// 1. That the `loanable_asset` indicated matches with the one in the lending_pool datum
/// 1. That the `collateral_ratio` indicated matches with the one in the _global settings_ datum
/// 1. That the `health_score` given is correctly calculated 
pub fn validate_audit_output(
  input: Input,
  output: Output,
  global_cfg: CfgGlobal,
  price: QuotePrice,
  pool_datum: LendingPoolDatum,
  tx_validity_range: ValidityRange,
) -> Bool {
  expect InlineDatum(input_inline_datum) = input.output.datum
  expect input_datum: AuditDatum = input_inline_datum
  expect InlineDatum(output_inline_datum) = output.datum
  expect output_datum: AuditDatum = output_inline_datum

  let AuditDatum {
    timestamp,
    collateral_asset,
    loanable_asset,
    collateral_ratio,
    total_collateral,
    total_borrowed,
    health_score,
    ..
  } = output_datum

  let tx_valid_from = get_lower_bound(tx_validity_range)
  let tx_valid_to = get_upper_bound(tx_validity_range)
  let timestamp_valid = and {
      tx_valid_from <= timestamp,
      tx_valid_to >= timestamp,
      input_datum.timestamp < timestamp,
      validate_tx_validity_range(tx_validity_range, global_cfg.max_tx_validity),
    }

  let collateral_asset_valid = collateral_asset == pool_datum.collateral_asset
  let loanable_asset_valid = loanable_asset == pool_datum.loanable_asset
  let collateral_ratio_valid = collateral_ratio == global_cfg.collateral_ratio

  let amt_users_can_borrow =
    calc_amt_user_can_borrow(total_collateral, collateral_ratio, price)
  let calculated_health_score = (amt_users_can_borrow, total_borrowed)
  let health_score_valid = health_score == calculated_health_score

  // trace @"calculated_health_score": calculated_health_score
  // trace @"given _health_score    ": health_score
  and {
    timestamp_valid?,
    collateral_asset_valid?,
    loanable_asset_valid?,
    collateral_ratio_valid?,
    health_score_valid?,
  }
}
