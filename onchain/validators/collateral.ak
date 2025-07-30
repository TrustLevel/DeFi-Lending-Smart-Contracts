//// Validator to hold utxos containing users' collateral deposits

use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Address, Script}
use cardano/assets.{from_lovelace, merge, quantity_of}
use cardano/script_context.{ScriptContext}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}
use helpers.{
  get_collateral_datum_from_input, get_gcfg, get_pos_token_name_from_input,
  is_collateral_locked, is_for_liquidation, read_oracle_data,
  validate_collateral_output_for_loan_req,
  validate_collateral_output_for_repayment_req, validate_dex_output,
  validate_input_w_pos_token, validate_liquidation_registry_output,
  validate_tx_validity_range,
}
use test_constants as tc
use types.{
  BorrowProcess, BorrowRequest, CollateralDatum, LiquidateCollateral, LoanDatum,
  LoanIssued, PositionRegistryDatum, RepayProcess, RepayRequest,
  SettleLiquidation, UnifiedRedeemer, WithdrawCollateral,
}
use utils.{is_signed_by}

validator collateral(settings_script: ScriptHash) {
  spend(
    _datum: Option<Data>,
    redeemer: UnifiedRedeemer,
    output_ref: OutputReference,
    this_tx: Transaction,
  ) {
    when redeemer is {
      WithdrawCollateral { input_idx } -> {
        expect Some(input) = list.at(this_tx.inputs, input_idx)
        expect input.output_reference == output_ref
        let (owner, collateral_datum) = get_collateral_datum_from_input(input)
        let collateral_not_locked = !is_collateral_locked(collateral_datum)
        let signed_by_owner = is_signed_by(this_tx.extra_signatories, owner)
        and {
          collateral_not_locked?,
          signed_by_owner?,
        }
      }
      BorrowRequest { loan_amt, loan_term, loan_asset, input_idx, output_idx } -> {
        expect Some(input) = list.at(this_tx.inputs, input_idx)
        expect input.output_reference == output_ref
        let (owner, collateral_datum) = get_collateral_datum_from_input(input)
        let collateral_is_available = !is_collateral_locked(collateral_datum)
        let signed_by_owner = is_signed_by(this_tx.extra_signatories, owner)

        expect Some(output) = list.at(this_tx.outputs, output_idx)
        let collateral_output_valid =
          validate_collateral_output_for_loan_req(
            output,
            input,
            collateral_datum,
            loan_amt,
            loan_term,
            loan_asset,
          )
        and {
          collateral_is_available?,
          signed_by_owner?,
          collateral_output_valid?,
        }
      }
      BorrowProcess { pool_idxs, cfg_idx, .. } -> {
        // get global settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // Require spending a utxo from lending_pool, to invoke validator functions there
        expect Some(pool_input) = list.at(this_tx.inputs, pool_idxs.1st)
        expect Script(pool_hash) = pool_input.output.address.payment_credential
        let has_pool_input = pool_hash == cfg.pool_contract
        has_pool_input?
      }
      RepayRequest { collateral_idxs: coll_idxs, registry_idx, cfg_idx } -> {
        expect Some(request_input) = list.at(this_tx.inputs, coll_idxs.1st)
        expect request_input.output_reference == output_ref
        let (owner, coll_datum) = get_collateral_datum_from_input(request_input)

        // get global settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // must have `LoanIssued` status
        let status_valid =
          when coll_datum.status is {
            LoanIssued -> True
            _ -> False
          }

        let signed_by_owner = is_signed_by(this_tx.extra_signatories, owner)

        // collateral input must contain exactly 1 position token
        let (pos_token_count_valid, pos_token) =
          get_pos_token_name_from_input(request_input, cfg.pool_contract)

        // The correct position UTXO (registry input) must be one of the reference inputs.
        // registry input must also contain exactly 1 of the same position token
        // contained in the collateral input
        expect Some(registry_input) =
          list.at(this_tx.reference_inputs, registry_idx)
        let registry_input_valid =
          validate_input_w_pos_token(
            registry_input,
            cfg.pool_contract,
            pos_token,
          )

        // The collateral output must contain both the collateral asset and the repayment asset
        // and its datum updated with `RepayRequested` status
        expect Some(request_output) = list.at(this_tx.outputs, coll_idxs.2nd)
        let collateral_output_valid =
          validate_collateral_output_for_repayment_req(
            request_output,
            request_input,
            registry_input,
          )
        and {
          status_valid?,
          signed_by_owner?,
          pos_token_count_valid?,
          registry_input_valid?,
          collateral_output_valid?,
        }
      }
      RepayProcess { pool_idxs, cfg_idx, .. } -> {
        // get global settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // Require spending a utxo from lending_pool, to invoke validator functions there
        expect Some(pool_input) = list.at(this_tx.inputs, pool_idxs.1st)
        expect Script(pool_hash) = pool_input.output.address.payment_credential
        let has_pool_input = pool_hash == cfg.pool_contract
        has_pool_input?
      }
      LiquidateCollateral {
        collateral_input_idx: coll_idx,
        oracle_idx,
        registry_idxs: reg_idxs,
        cfg_idx,
        dex_output_idx: dex_idx,
        liquidation_dex: dex,
        liquidator,
      } -> {
        expect Some(collateral_input) = list.at(this_tx.inputs, coll_idx)
        expect collateral_input.output_reference == output_ref

        // get global settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // collateral input must contain exactly 1 position token
        let (pos_token_count_valid, pos_token) =
          get_pos_token_name_from_input(collateral_input, cfg.pool_contract)

        // The correct position UTXO (registry input) must be one of the inputs.
        // registry input must also contain exactly 1 of the same position token
        // contained in the collateral input
        expect Some(registry_input) = list.at(this_tx.inputs, reg_idxs.1st)
        let registry_input_valid =
          validate_input_w_pos_token(
            registry_input,
            cfg.pool_contract,
            pos_token,
          )

        // validate oracle data and get latest price of collateral
        expect Some(oracle_input) =
          list.at(this_tx.reference_inputs, oracle_idx)
        expect InlineDatum(position_datum) = registry_input.output.datum
        expect position: PositionRegistryDatum = position_datum
        let loan = position.loan
        let tx_range = this_tx.validity_range
        let (price, oracle_data_valid) =
          read_oracle_data(
            oracle_input,
            loan.collateral_asset,
            loan.borrowed_asset,
            tx_range,
            cfg.oracle_contract,
          )

        // check if due for liquidation
        let for_liquidation =
          is_for_liquidation(loan, cfg.collateral_ratio, price, tx_range)

        // check that both position tokens are sent back to the registry contract
        // and the position datum is updated correctly
        expect Some(registry_output) = list.at(this_tx.outputs, reg_idxs.2nd)
        let registry_output_valid =
          validate_liquidation_registry_output(
            registry_output,
            registry_input,
            cfg.pool_contract,
            pos_token,
            liquidator,
          )

        // check if collateral is sent to dex order address, and validate its datum
        expect Some(dex_output) = list.at(this_tx.outputs, dex_idx)
        let collateral_asset = loan.collateral_asset
        let collateral_amt =
          quantity_of(
            collateral_input.output.value,
            collateral_asset.policy_id,
            collateral_asset.asset_name,
          )
        let dex_output_valid =
          validate_dex_output(
            cfg,
            dex,
            dex_output,
            registry_output,
            collateral_asset,
            collateral_amt,
          )

        // check if signed by liquidator
        let signed_by_liquidator =
          is_signed_by(this_tx.extra_signatories, liquidator)

        // validate tx validity range
        let validity_range_valid =
          validate_tx_validity_range(tx_range, cfg.max_tx_validity)

        and {
          pos_token_count_valid?,
          registry_input_valid?,
          oracle_data_valid?,
          for_liquidation?,
          dex_output_valid?,
          registry_output_valid?,
          signed_by_liquidator?,
          validity_range_valid?,
        }
      }
      SettleLiquidation { pool_idxs, cfg_idx, .. } -> {
        // get global settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // Require spending a utxo from lending_pool, to invoke validator functions there
        expect Some(pool_input) = list.at(this_tx.inputs, pool_idxs.1st)
        expect Script(pool_hash) = pool_input.output.address.payment_credential
        let has_pool_input = pool_hash == cfg.pool_contract
        has_pool_input?
      }

      _ -> True
    }
  }

  /// Unsupported validator purpose
  else(_ctx: ScriptContext) {
    fail @"Unsupported purpose for collateral validator"
  }
}

/// Test for `WithdrawCollateral` redeemer
test collateral_withdraw_succeed() {
  let redeemer = tc.redeemer_withdraw_collat
  let datum_as_data: Data = tc.available_collateral_datum
  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    tc.available_collateral_utxo.output_reference,
    tc.tx_withdraw_collat,
  )
}

/// Fail test for `WithdrawCollateral` redeemer
///
/// Fail point: input collateral status is not `Available`
test collateral_withdraw_fail() fail {
  let redeemer = tc.redeemer_withdraw_collat
  let datum_as_data: Data = tc.loan_issued_collateral_datum
  let output_ref = tc.available_collateral_utxo.output_reference

  let locked_collateral_utxo =
    Input { ..tc.loan_issued_collateral_utxo, output_reference: output_ref }
  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_withdraw_collat,
      inputs: [tc.user_utxo, locked_collateral_utxo],
    },
  )
}

/// Test for `BorrowRequest` redeemer
test borrow_req_succeed() {
  let datum_as_data: Data = tc.available_collateral_datum
  let redeemer = tc.redeemer_borrow_request
  let output_ref = tc.available_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_borrow_request,
  )
}

/// Fail test for `BorrowRequest` redeemer
///
/// Fail point: input collateral is already used in a currently open loan position
test borrow_req_fail() fail {
  let datum_as_data: Data = tc.available_collateral_datum
  let redeemer = tc.redeemer_borrow_request
  let output_ref = tc.available_collateral_utxo.output_reference

  let locked_collateral_utxo =
    Input {
      ..tc.loan_issued_collateral_utxo,
      output_reference: tc.available_collateral_utxo.output_reference,
    }

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction { ..tc.tx_borrow_request, inputs: [locked_collateral_utxo] },
  )
}

/// Test for `BorrowProcess` redeemer
test borrow_proc_succeed() {
  let datum_as_data: Data = tc.loan_requested_collateral_datum
  let redeemer = tc.redeemer_borrow_process
  let output_ref = tc.loan_req_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_borrow_process,
  )
}

/// Fail test for `BorrowProcess` redeemer
///
/// Fail point: inputs do not include a UTXO from `lending_pool`
test borrow_proc_fail() fail {
  let datum_as_data: Data = tc.loan_requested_collateral_datum
  let redeemer = tc.redeemer_borrow_process
  let output_ref = tc.loan_req_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_borrow_process,
      inputs: [tc.loan_req_collateral_utxo, tc.oracle_price_utxo],
    },
  )
}

/// Test for `RepayRequest` redeemer
test repay_req_succeed() {
  let datum_as_data: Data = tc.loan_issued_collateral_datum
  let redeemer = tc.redeemer_repay_req
  let output_ref = tc.loan_issued_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_repay_request,
  )
}

/// Fail test for `RepayRequest` redeemer
///
/// Fail point: collateral output does not contain the repayment asset
test repay_req_fail() fail {
  let datum_as_data: Data = tc.loan_issued_collateral_datum
  let redeemer = tc.redeemer_repay_req
  let output_ref = tc.loan_issued_collateral_utxo.output_reference

  let bad_collateral_output =
    Output {
      ..tc.repay_req_collateral_utxo.output,
      value: from_lovelace(1_000_000_000)
        |> merge(tc.position_token_value),
    }

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction { ..tc.tx_repay_request, outputs: [bad_collateral_output] },
  )
}

/// Test for `RepayProcess` redeemer
test repay_proc_succeed() {
  let datum_as_data: Data = tc.repay_requested_collateral_datum
  let redeemer = tc.redeemer_repay_process
  let output_ref = tc.repay_req_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_repay_process,
  )
}

/// Fail test for `RepayProcess` redeemer
///
/// Fail point: inputs do not include a UTXO from `lending_pool`
test repay_proc_fail() fail {
  let datum_as_data: Data = tc.repay_requested_collateral_datum
  let redeemer = tc.redeemer_repay_process
  let output_ref = tc.repay_req_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_repay_process,
      inputs: [
        tc.repay_req_collateral_utxo,
        tc.registry_position_utxo,
        tc.registry_position_utxo,
      ],
    },
  )
}

/// Test for `LiquidateCollateral` redeemer
test liquidate_succeed() {
  let datum_as_data: Data = tc.loan_issued_collateral_datum
  let redeemer = tc.redeemer_liquidate_collateral
  let output_ref = tc.loan_issued_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_liquidate_collateral,
  )
}

/// Fail test for `LiquidateCollateral` redeemer
///
/// Fail point: bad datum hash in minswap order datum
test liquidate_fail() fail {
  let datum_as_data: Data = tc.loan_issued_collateral_datum
  let redeemer = tc.redeemer_liquidate_collateral
  let output_ref = tc.loan_issued_collateral_utxo.output_reference

  let bad_dex_output =
    Output {
      ..tc.liquidation_dex_output,
      datum: InlineDatum(tc.bad_minswap_order_datum),
    }

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_liquidate_collateral,
      outputs: [tc.registry_utxo_from_liquidation.output, bad_dex_output],
    },
  )
}

/// Test for `SettleLiquidation` redeemer
test settle_liquidation_succeed() {
  let datum_as_data: Data = tc.liquidated_collateral_utxo.output.datum
  let redeemer = tc.redeemer_settle_liquidation
  let output_ref = tc.liquidated_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_settle_liquidation,
  )
}

/// Fail test for `SettleLiquidation` redeemer
///
/// Fail point: inputs do not include a UTXO from `lending_pool`
test settle_liquidation_fail() fail {
  let datum_as_data: Data = tc.liquidated_collateral_utxo.output.datum
  let redeemer = tc.redeemer_settle_liquidation
  let output_ref = tc.liquidated_collateral_utxo.output_reference

  collateral.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_settle_liquidation,
      inputs: [
        tc.liquidated_collateral_utxo,
        tc.registry_utxo_from_liquidation,
        tc.registry_utxo_from_liquidation,
      ],
    },
  )
}
