//// This module contains utility functions that are used in the protocol.

use aiken/collection/list
use aiken/crypto.{ScriptHash, VerificationKeyHash}
use aiken/interval.{Finite}
use cardano/address.{Script}
use cardano/assets.{match}
use cardano/transaction.{Input, Output, ValidityRange}

/// Check if the given `signer` is included in the given list of required signers.
pub fn is_signed_by(
  reqd_signers: List<VerificationKeyHash>,
  signer: VerificationKeyHash,
) -> Bool {
  list.has(reqd_signers, signer)
}

/// Get the validator `ScriptHash` from a given output.
/// Fails if the given output is not from a validator script.
pub fn get_script_hash_frm_output(output: Output) -> ScriptHash {
  when output.address.payment_credential is {
    Script(script_hash) -> script_hash
    _ -> fail @"Given output is not locked in a script."
  }
}

/// Checks the given `Output` against the given `Input` for the following:
/// 1. That the value is the same
/// 1. That the datum is the same
/// 1. That the output goes back to the same address
pub fn validate_returned_output_unchanged(output: Output, input: Input) -> Bool {
  let values_match = match(output.value, input.output.value, >=)
  let datums_match = output.datum == input.output.datum
  let value_returned = output.address == input.output.address
  and {
    values_match?,
    datums_match?,
    value_returned?,
  }
}

/// Get the lower bound `IntervalBound` from given transaction validity range
/// (POSIXTime in milliseconds).
/// Fails if given validity range does not contain a `Finite` lower bound type
pub fn get_lower_bound(range: ValidityRange) -> Int {
  expect Finite(lower_bound) = range.lower_bound.bound_type
  lower_bound
}

/// Get the upper bound `IntervalBound` from given transaction validity range
/// (POSIXTime in milliseconds).
/// Fails if given validity range does not contain a `Finite` upper bound type
pub fn get_upper_bound(range: ValidityRange) -> Int {
  expect Finite(upper_bound) = range.upper_bound.bound_type
  upper_bound
}
