//// Validator to hold the lending pool utxo which contains the loanable asset

use aiken/builtin.{serialise_data}
use aiken/collection/dict.{find}
use aiken/collection/list
use aiken/crypto.{ScriptHash, blake2b_256}
use aiken/interval
use cardano/address.{Script}
use cardano/assets.{PolicyId, quantity_of, tokens}
use cardano/script_context.{ScriptContext}
use cardano/transaction.{
  DatumHash, InlineDatum, Input, Output, OutputReference, Transaction,
}
use helpers.{
  calc_amt_user_can_borrow, calc_position_token_name,
  get_collateral_amt_in_output, get_common_utxos, get_gcfg, get_registry_datum,
  read_oracle_data, validate_collateral_input_for_loan_proc,
  validate_collateral_input_for_repayment_proc,
  validate_collateral_output_for_loan_proc,
  validate_collateral_output_for_repayment_proc, validate_input_w_pos_token,
  validate_lending_pool_output, validate_protocol_inputs_count,
  validate_registry_output_for_loan_proc, validate_tx_validity_range,
}
use test_constants as tc
use types.{
  BorrowProcess, CommonUtxos, LendingPoolDatum, LoanDatum, PositionRegistryDatum,
  RepayProcess, SettleLiquidation, UnifiedRedeemer, WithdrawLendingPool,
}
use utils.{get_upper_bound, is_signed_by}

validator lending_pool(settings_script: ScriptHash) {
  mint(redeemer: UnifiedRedeemer, this_policy: PolicyId, this_tx: Transaction) {
    when redeemer is {
      BorrowProcess { pool_idxs, .. } |
      RepayProcess { pool_idxs, .. } |
      SettleLiquidation { pool_idxs, .. } -> {
        expect Some(pool_input) = list.at(this_tx.inputs, pool_idxs.1st)
        let has_pool_input =
          when pool_input.output.address.payment_credential is {
            Script(script_hash) -> script_hash == this_policy
            _ -> False
          }
        has_pool_input?
      }
      _ -> fail @"Invalid mint/burn redeemer for position tokens"
    }
  }

  spend(
    datum: Option<Data>,
    redeemer: UnifiedRedeemer,
    output_ref: OutputReference,
    this_tx: Transaction,
  ) {
    when redeemer is {
      BorrowProcess {
        collateral_idxs,
        oracle_idx,
        pool_idxs,
        cfg_idx,
        registry_output_idx,
      } -> {
        expect Some(raw_datum) = datum
        expect pool_datum: LendingPoolDatum = raw_datum

        let CommonUtxos {
          collateral_input,
          collateral_output,
          pool_input,
          pool_output,
        } = get_common_utxos(this_tx, collateral_idxs, pool_idxs, output_ref)

        // get global config settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // validate protocol inputs count
        let inputs_count_valid =
          validate_protocol_inputs_count(redeemer, this_tx.inputs, cfg)

        // validate collateral input and `LoanRequested` status
        let (collateral_input_valid, collateral_owner, loan_req) =
          validate_collateral_input_for_loan_proc(
            collateral_input,
            cfg.collateral_contract,
            pool_datum.loanable_asset,
          )

        // validate oracle data and get latest price of collateral
        expect Some(oracle_input) =
          list.at(this_tx.reference_inputs, oracle_idx)
        let (price, oracle_data_valid) =
          read_oracle_data(
            oracle_input,
            pool_datum.collateral_asset,
            pool_datum.loanable_asset,
            this_tx.validity_range,
            cfg.oracle_contract,
          )

        // validate sufficiency of collateral
        let collateral_amt =
          collateral_input.output
            |> get_collateral_amt_in_output(pool_datum.collateral_asset)
        let loanable_amt =
          calc_amt_user_can_borrow(collateral_amt, cfg.collateral_ratio, price)
        let collateral_sufficient = loan_req.borrowed_amt <= loanable_amt

        // validate minted position token pair
        let position_token = calc_position_token_name(collateral_input)
        let valid_pos_tokens_minted =
          2 == quantity_of(this_tx.mint, cfg.pool_contract, position_token)

        // validate collateral output value and datum
        let collateral_output_valid =
          validate_collateral_output_for_loan_proc(
            collateral_output,
            collateral_input,
            collateral_owner,
            pool_datum.collateral_asset,
            cfg.pool_contract,
            position_token,
          )
        // validate position registry output value and datum
        expect Some(registry_output) =
          list.at(this_tx.outputs, registry_output_idx)
        let registry_output_valid =
          validate_registry_output_for_loan_proc(
            registry_output,
            collateral_owner,
            collateral_amt,
            loan_req,
            pool_datum,
            cfg,
            position_token,
            this_tx.validity_range,
          )

        let pool_output_valid =
          validate_lending_pool_output(
            pool_input,
            pool_output,
            pool_datum,
            loan_req.borrowed_amt,
            None,
            redeemer,
          )

        // validate tx validity range
        let validity_range_valid =
          validate_tx_validity_range(
            this_tx.validity_range,
            cfg.max_tx_validity,
          )

        and {
          inputs_count_valid?,
          collateral_input_valid?,
          oracle_data_valid?,
          collateral_sufficient?,
          valid_pos_tokens_minted?,
          collateral_output_valid?,
          registry_output_valid?,
          pool_output_valid?,
          validity_range_valid?,
        }
      }

      RepayProcess { collateral_idxs, pool_idxs, cfg_idx, registry_input_idx } -> {
        expect Some(raw_datum) = datum
        expect pool_datum: LendingPoolDatum = raw_datum
        let CommonUtxos {
          collateral_input,
          collateral_output,
          pool_input,
          pool_output,
        } = get_common_utxos(this_tx, collateral_idxs, pool_idxs, output_ref)

        // get global config settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // validate protocol inputs count
        let inputs_count_valid =
          validate_protocol_inputs_count(redeemer, this_tx.inputs, cfg)

        // validate collateral input and `RepayRequested` status
        let (collateral_input_valid, collateral_owner, pos_token) =
          validate_collateral_input_for_repayment_proc(collateral_input, cfg)

        // validate registry input
        expect Some(registry_input) =
          list.at(this_tx.inputs, registry_input_idx)
        let registry_input_valid =
          registry_input
            |> validate_input_w_pos_token(cfg.pool_contract, pos_token)

        // check that tx validity range is within the specified period in the lending pool settings
        let validity_range_valid =
          validate_tx_validity_range(
            this_tx.validity_range,
            cfg.max_tx_validity,
          )

        // check that the loan hasn't matured yet
        // use upper bound of tx validity range as reckoning time of payment to counter back-dating 
        // of repayment transaction.
        expect Some(registry_datum) =
          get_registry_datum(registry_input.output.datum)
        let loan = registry_datum.loan
        let repayment_time = get_upper_bound(this_tx.validity_range)
        let loan_unmatured = repayment_time <= loan.maturity

        let lending_pool_output_valid =
          validate_lending_pool_output(
            pool_input,
            pool_output,
            pool_datum,
            loan.borrowed_amt,
            Some(loan.interest_amt),
            redeemer,
          )

        let collateral_output_valid =
          validate_collateral_output_for_repayment_proc(
            collateral_input,
            collateral_output,
            collateral_owner,
            pool_datum.collateral_asset,
          )

        let valid_pos_tokens_burned =
          -2 == quantity_of(this_tx.mint, cfg.pool_contract, pos_token)

        and {
          inputs_count_valid?,
          collateral_input_valid?,
          registry_input_valid?,
          validity_range_valid?,
          loan_unmatured?,
          lending_pool_output_valid?,
          collateral_output_valid?,
          valid_pos_tokens_burned?,
        }
      }

      SettleLiquidation {
        collateral_input_idx: coll_idx,
        registry_input_idx: reg_idx,
        pool_idxs,
        cfg_idx,
      } -> {
        expect Some(raw_datum) = datum
        expect pool_datum: LendingPoolDatum = raw_datum

        expect Some(pool_input) = list.at(this_tx.inputs, pool_idxs.1st)
        expect pool_input.output_reference == output_ref

        // get global settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // validate protocol inputs count
        let inputs_count_valid =
          validate_protocol_inputs_count(redeemer, this_tx.inputs, cfg)

        // validate collateral_input specified in redeemer, and get datum_hash
        expect Some(collateral_input) = list.at(this_tx.inputs, coll_idx)
        expect
          Script(cfg.collateral_contract) == collateral_input.output.address.payment_credential
        expect DatumHash(input_datum_hash) = collateral_input.output.datum

        // registry input must contain exactly 2 position tokens
        expect Some(registry_input) = list.at(this_tx.inputs, reg_idx)
        let position_tokens =
          tokens(registry_input.output.value, cfg.pool_contract)
        expect Some(pos_token) = find(position_tokens, 2)
        expect Some(registry_datum) =
          get_registry_datum(registry_input.output.datum)
        let loan = registry_datum.loan

        // hash of position token name must match with the collateral input datum hash.
        // this is how we confirm that the registry input is the correct one for the 
        // collateral input
        let reg_and_coll_inputs_match =
          blake2b_256(serialise_data(registry_datum)) == input_datum_hash

        // only make sure the lending_pool is repaid the loaned amount + interest.
        // it's up to the liquidator where they want to send the rest of the liquidated collateral.
        expect Some(pool_output) = list.at(this_tx.outputs, pool_idxs.2nd)
        let lending_pool_output_valid =
          validate_lending_pool_output(
            pool_input,
            pool_output,
            pool_datum,
            loan.borrowed_amt,
            Some(loan.interest_amt),
            redeemer,
          )

        expect Some(liquidator) = registry_datum.liquidator
        let signed_by_liquidator =
          is_signed_by(this_tx.extra_signatories, liquidator)

        let pos_tokens_burned =
          -2 == quantity_of(this_tx.mint, cfg.pool_contract, pos_token)

        and {
          inputs_count_valid?,
          reg_and_coll_inputs_match?,
          lending_pool_output_valid?,
          signed_by_liquidator?,
          pos_tokens_burned?,
        }
      }

      WithdrawLendingPool { pool_input_idx, cfg_idx } -> {
        // for admin only, when closing or withdrawing from the lending pool
        expect Some(input) = list.at(this_tx.inputs, pool_input_idx)
        expect input.output_reference == output_ref

        // get global config settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        let signed_by_admin =
          is_signed_by(this_tx.extra_signatories, cfg.admin_key_hash)
        signed_by_admin?
      }
      _ -> fail @"Invalid redeemer for lending_pool validator"
    }
  }

  else(_ctx: ScriptContext) {
    fail @"Unsupported purpose for lending_pool validator"
  }
}

/// Test for `BorrowProcess` redeemer on `mint` purpose
test mint_position_tokens_succeed() {
  lending_pool.mint(
    tc.settings_script_hash,
    tc.redeemer_borrow_process,
    tc.lending_pool_script_hash,
    tc.tx_borrow_process,
  )
}

/// Fail test for `BorrowProcess` redeemer on `mint` purpose
///
/// Fail point: inputs do not include a UTXO from `lending_pool`
test mint_position_tokens_fail() fail {
  lending_pool.mint(
    tc.settings_script_hash,
    tc.redeemer_borrow_process,
    tc.lending_pool_script_hash,
    Transaction {
      ..tc.tx_borrow_process,
      inputs: [tc.loan_req_collateral_utxo, tc.repay_req_collateral_utxo],
    },
  )
}

/// Test for `SettleLiquidation` redeemer on `mint` purpose
test burn_position_tokens_succeed() {
  lending_pool.mint(
    tc.settings_script_hash,
    tc.redeemer_settle_liquidation,
    tc.lending_pool_script_hash,
    tc.tx_settle_liquidation,
  )
}

/// Fail test for `SettleLiquidation` redeemer on `mint` purpose
///
/// Fail point: inputs do not include a UTXO from `lending_pool`
test burn_position_tokens_fail() fail {
  lending_pool.mint(
    tc.settings_script_hash,
    tc.redeemer_borrow_process,
    tc.lending_pool_script_hash,
    Transaction {
      ..tc.tx_settle_liquidation,
      inputs: [
        tc.liquidated_collateral_utxo,
        tc.registry_utxo_from_liquidation,
        tc.repay_req_collateral_utxo,
      ],
    },
  )
}

/// Test for `BorrowProcess` redeemer on `spend` purpose
test borrow_process_succeed() {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_borrow_process
  let output_ref = tc.pool_input_for_loan_issue.output_reference

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_borrow_process,
  )
}

/// Fail test for `BorrowProcess` redeemer on `spend` purpose
///
/// Fail point: position UTXO contains wrong loan metadata (incorrect interest amount)
test borrow_process_fail() fail {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_borrow_process
  let output_ref = tc.pool_input_for_loan_issue.output_reference

  let bad_registry_datum =
    PositionRegistryDatum {
      ..tc.position_registry_datum,
      loan: LoanDatum {
        ..tc.loan_issued_datum,
        interest_amt: tc.interest_amt - 1,
      },
    }
  let bad_registry_position_utxo =
    Output {
      ..tc.registry_position_utxo.output,
      datum: InlineDatum(bad_registry_datum),
    }

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_borrow_process,
      outputs: [
        tc.loan_issued_collateral_utxo.output,
        tc.pool_output_after_loan_issue.output,
        bad_registry_position_utxo,
      ],
    },
  )
}

/// Test for `RepayProcess` redeemer on `spend` purpose
test repay_process_succeed() {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_repay_process
  let output_ref = tc.pool_output_after_loan_issue.output_reference

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_repay_process,
  )
}

/// Fail test for `RepayProcess` redeemer on `spend` purpose
///
/// Fail point: loan has already matured (overdue)
test repay_process_fail() fail {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_repay_process
  let output_ref = tc.pool_output_after_loan_issue.output_reference

  let repay_tx_valid_til = tc.maturity_time + 1
  let repay_tx_valid_from = repay_tx_valid_til - tc.max_tx_validity

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_repay_process,
      validity_range: interval.between(repay_tx_valid_from, repay_tx_valid_til),
    },
  )
}

/// Test for `SettleLiquidation` redeemer on `spend` purpose
test settle_liquidation_succeed() {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_settle_liquidation
  let output_ref = tc.pool_output_after_loan_issue.output_reference

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_settle_liquidation,
  )
}

/// Fail test for `SettleLiquidation` redeemer on `spend` purpose
///
/// Fail point: input collateral UTXO doesn't contain correct datum hash
test settle_liquidation_fail() fail {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_settle_liquidation
  let output_ref = tc.pool_output_after_loan_issue.output_reference

  let bad_liquidated_collateral_utxo =
    Input {
      ..tc.liquidated_collateral_utxo,
      output: Output {
        ..tc.liquidated_collateral_utxo.output,
        datum: DatumHash(blake2b_256(tc.position_token_bad_name)),
      },
    }

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_settle_liquidation,
      inputs: [
        bad_liquidated_collateral_utxo,
        tc.registry_utxo_from_liquidation,
        tc.pool_output_after_loan_issue,
      ],
    },
  )
}

/// Test for `WithdrawLendingPool` redeemer on `spend` purpose
test withdraw_lp_succeed() {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_withdraw_lp
  let output_ref = tc.pool_output_after_loan_repayment.output_reference

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_withdraw_lp,
  )
}

/// Fail test for `WithdrawLendingPool` redeemer on `spend` purpose
///
/// Fail point: tx not signed by admin
test withdraw_lp_fail() fail {
  let datum_as_data: Data = tc.pool_datum
  let redeemer = tc.redeemer_withdraw_lp
  let output_ref = tc.pool_output_after_loan_repayment.output_reference

  lending_pool.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction { ..tc.tx_withdraw_lp, extra_signatories: [] },
  )
}
