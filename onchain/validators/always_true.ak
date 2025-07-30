//// Validator to hold test loanable tokens, like a faucet

validator always_true {
  spend(_datum, _redeemer, _output_ref, _tx) {
    True
  }

  else(_context) {
    True
  }
}
