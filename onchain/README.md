# On-chain Components

    1. Collateral Management Logic
    2. Issuance & Redemption Logic (= "Lending Pool")
    3. Ownership & Custody Logic (= "Position Registry")
    4. Price Oracle Logic
    5. Protocol Audit Logic
    6. Liquidation Logic

Written in [Aiken](https://aiken-lang.org/) and developed for [TrustLevel](https://www.trustlevel.io/)

**NOTE**: Details on the onchain components design can be found [here](https://lending-aiken-docs.staking.rocks).

## Building

```sh
aiken build

# Or include traces for testing/debugging:
# (Note that collateral and lending_pool contracts individually exceed tx size limit if compiled verbose)
aiken build -t verbose
```

## Testing

To run all tests:
```sh
aiken check
```

To run only tests matching the string `foo`, do:
```sh
aiken check -m foo
```

## Concurrency and Double-Satisfaction

To address the risk of [double-satisfaction](https://aiken-lang.org/fundamentals/common-design-patterns#problem-double-satisfaction) exploits, the loanable asset in the lending pool is contained in only 1 `utxo`.

As a consequence, only 1 transaction at a time can ever spend the lending pool's utxo and trigger its validation rules to be evaluated.

To allow users to concurrently take loans and repay active ones, the "loan" and "repayment" interactions
are broken up into 2 blockchain transactions. This is similar to the request-and-batching done by dexes.

In the first part, the user submits their request - either loan takeout or loan repayment. In this transaction, they will only be spending their own collateral utxo, so other users are not affected.

The second part, which is the fulfillment of the user's request, is done in the backend. This is where we immediately chain the transaction that spends the lending pool's only utxo, to send to the user the loaned asset they requested. The lending pool's new utxo can then be persistently stored, immediately ready to be used for the next fulfillment tx without waiting on the network for finality.

## Input/Redeemer Indexing

The [redeemer indexing](https://anastasia-labs.github.io/lucid-evolution/documentation/deep-dives/validator-interactions/advanced/redeemer-indexing) [design pattern](https://github.com/Anastasia-Labs/design-patterns/blob/main/utxo-indexers/UTXO-INDEXERS.md) is also implemented in the protocol, to reduce double-satisfaction risks, and more importantly to significantly reduce contract execution costs.


## Process

1. **Initialization**
    1. Protocol owner deploys the compiled _Plutus_ validators into `utxo`'s as reference scripts, and initialize the UTXOs containing the protocol's settings.

    1. Protocol owner deposits the loanable asset into the `lending_pool` contract address.

2. **Usage**

    * _User_:
        1. User deposits their collateral asset into the `collateral` manager contract address.
        
        1. User may withdraw their deposited collateral if it is not locked in an active loan.
        
        1. User takes out a loan by:
            - Tx 1 (by user) User submits a loan request tx. This locks their collateral deposit and records the amount they want to borrow.

            - Tx 2 (chained to Tx 1 in the backend) A tx fulfilling the loan request of the user is automatically chained to the user's loan request. This spends the corresponding amount of loanable asset from the `lending_pool` contract and sends it to the requesting user.
        
        1. User repays an active loan through the same request-fulfill mechanism.

    * _Oracle Data Provider_:

        1. Trusted oracle data provider runs a service that periodically checks relevant dexes for the current price of the collateral asset against the loanable asset. The oracle price UTXO is then updated with the latest price data.

    * _Admin_:

        1. Admin (or anyone) runs a service that periodically checks all open loan positions for under-collateralization or maturity. If any are found, liquidation txs will be submitted for those positions.




## Protocol Spec / Validator Operation

### UTXOs
The current design of this protocol involves 7 validators that hold the following UTXOs respectively.

1. `refscripts.ak`:

    UTXOs containing the protocol's compiled validator code as reference scripts.

2. `settings.ak`:

    UTXOs containing settings that are used by different components of the protocol.

3. `collateral.ak`:

    UTXOs containing users' collateral assets, and a reference to their loan metadata if they have an open loan position.

4. `position_registry.ak`:

    UTXOs containing metadata of open loan positions (_position UTXOs_).

5. `lending_pool.ak`:

    The single UTXO containing the loanable asset. The datum in this UTXO also contains the lending pool settings such as the collateral asset, its price, loan-to-value ratio, and the list of interest rates for different loan terms.

6. `oracle.ak`:

    1. UTXO's containing updated pricing data for the collateral asset (_price UTXOs_). This is used in the loan issuance logic.

    1. A single UTXO containing the `oracle` settings (_settings UTXO_) - the list of _trusted providers_.

7. `audit.ak`:

    UTXO containing the protocol's updated “health score” based on a number of key factors.

### Position Tokens

The metadata of each open loan position are contained in UTXOs held at the `position_registry` contract (_"position UTXO"_). These _position UTXOs_ are created when a user borrows from the lending pool, and are removed when a loan position is closed.

When a loan position is opened, a unique pair of _"position tokens"_ are minted. These are [beacon tokens](https://developers.cardano.org/blog/2025-03-31-march/#:~:text=Beacon%20tokens%20are%20native%20assets%20whose%20main%20purpose%20is%20to%20tag%20UTxOs) used to tag the _collateral UTXO_ that is used for the loan, and its corresponding _position UTXO_ held at the `position_registry` contract. The _"position tokens"_ link them together. Uniqueness of the pair is ensured by using the _UTXO id_ of the input collateral UTXO.

When a loan is closed (repaid or liquidated), the _position tokens_ are burned.

The minting policy of these _"position tokens"_ is contained in the `lending_pool` contract.

### Oracle Tokens

The `oracle` contract mints  _oracle price tokens_: `OPRC`. These are beacon tokens that are used to identify the UTXO(s) containing official price data for collateral assets.

### Settings Tokens

The `settings` contract mints 3 beacon tokens once (on initialization only):

1. `GCFG` - The beacon token for the UTXO containing the global settings datum
2. `OCFG` - The beacon token for the UTXO containing the oracle settings datum
3. `AUDT` - The beacon token for the UTXO containing the audit datum

-----

### Requirements when withdrawing collateral

Redeemer: `WithdrawCollateral`

Enforced by `collateral.ak`:
1. The collateral UTXO must not be used in an open loan position.
2. The owner of the collateral must sign the transaction.

### Requirements when issuing loans
- Part 1: **User submits loan request**

    Redeemer: `BorrowRequest`

    Enforced by `collateral.ak`:
    1. The collateral UTXO must not be used in an open loan position.
    2. The owner of the collateral must sign the transaction.
    3. The collateral asset must be returned back to the `collateral` contract address after the tx.
    4. The collateral UTXO datum must be updated with `LoanRequested` status, together with the loan details.
    
    **Note**: No need to restrict collateral inputs to only 1. Multiple collateral UTXOs that have `Available` status can be used to request for a loan. Their values will just have to be merged into 1 output containing the loan request datum. That is, only if the collateral is ADA.

- Part 2: **Loan request fulfillment tx is chained**

    Redeemer: `BorrowProcess`

    Enforced by `lending_pool.ak`:
    1. There must be 1 input utxo each from the `collateral` and the `lending_pool` contracts respectively.
    2. The _global settings_ UTXO and the _oracle price_ UTXO must be included in the reference inputs.
    3. The collateral utxo datum must have the status `LoanRequested`.
    4. The _oracle UTXO_ must contain _updated_ price data for the collateral asset.
    5. The collateral asset utxo must contain sufficient amount of collateral asset for the loan being taken, as determined by its current price from the oracle, and the loan-to-value ratio setting.
    6. A unique **pair** of position tokens must be minted for the current loan position.
    7. The collateral asset must be returned back to the `collateral` contract with an updated datum containing the status of `LoanIssued`, and tagged with one of the _position token_ pair.
    8. A _position UTXO_ must be created at the `position_registry` contract, containing the other one of the _position token_ pair. In its datum, the following loan information should be contained:
        1. Borrower
        2. Collateral asset and amount
        3. Borrowed asset and amount
        4. Interest payable
        5. Loan term chosen
        6. Maturity date
    9. All excess assets (lovelace & everything else) from the `lending_pool` utxo must be returned to the `lending_pool` contract.
    10. The lending pool utxo datum must not change.
    11. The tx validity range must be within the specified period in the lending pool settings.

    Enforced by `collateral.ak`:
    12. A utxo from the `lending_pool` contract must be spent in the transaction.

    

### Requirements when repaying a loan

- Part 1: **User submits loan repayment request**

    Redeemer: `RepayRequest`

    Enforced by `collateral.ak`:
    1. The _global settings_ utxo must be one of the _reference_ inputs.
    2. The collateral utxo must have the status `LoanIssued`.
    3. The owner of the collateral must sign the transaction.
    4. The collateral input must contain exactly 1 _position token_.
    5. The correct _position UTXO_ must be one of the _reference_ inputs.
    6. The _output_ collateral utxo must:
        1. contain both the collateral asset and the repayment asset
        2. have its datum updated with `RepayRequested` status


    **Notes**:
    - No need to restrict to only 1 collateral input in a tx here since `collateral` validator requires the UTXO value to be returned back to the contract. Only the datum is changed. Even if multiple collateral UTXO's are spent with `RepayRequest` redeemer, they will all have to be returned back to the `collateral` contract anyway, with datum changes ensured to be correct.

    - Also no need to require not having an input from `lending_pool` since the only redeemers accepted by `lending_pool` all require the input collateral UTXOs to have the status not equal to `LoanIssued`. So, no unauthorized or unintended spending of `collateral` or `lending_pool` UTXO's will be approved.

- Part 2: **Loan repayment request fulfillment tx is chained**

    Redeemer: `RepayProcess`

    Enforced by `lending_pool.ak`:
    1. There must be 1 input utxo each from the `collateral`, the `position_registry`, and the `lending_pool` contracts respectively.
    2. The _global settings_ UTXO must be included in the _reference_ inputs.
    3. The input collateral utxo must be validated:
        1. that its address matches with the settings in the `lending_pool` datum;
        2. that its datum has the status `RepayRequested`
        3. that it contains a position token
    4. The input position utxo must be validated:
        1. that it contains the same position token contained in the input collateral utxo
        2. that its datum contains the loan metadata
    5. The tx validity range must be within the specified period in the lending pool settings.
    6. The tx must be finalized not later than the maturity date and time.
    7. The output lending pool utxo must be validated:
        1. that its datum does not change
        2. that the amount of the loanable asset it contains is the total of:
            1. The amount contained in the input lender utxo
            2. The borrowed amount
            3. The interest amount
        3. that it is going back to the `lending_pool` contract
    8. The output collateral utxo must be validated:
        1. that the amounts of lovelace and/or collateral assets is the same as in the input
        2. that the datum is updated with `Available` status
        3. that it is going back to the `collateral` contract
    9. The _position token_ pair must be burned
    
    **Note**:

    There's no more need to check that there's no output going to the `position_registry` contract. All the validations done above, should leave no more assets from the protocol that can be sent to any other address.

    Enforced by `collateral.ak`:
    1. A utxo from the `lending_pool` contract must be spent in the transaction.

    Enforced by `position_registry.ak`:
    2. The correct collateral UTXO must be one of the inputs, containing the same _position token_ as the one in the position UTXO.


### Requirements when liquidating a loan position

- Part 1: **Liquidator sells the collateral for the loaned asset at a dex**

    Redeemer: `LiquidateCollateral`

    Enforced by `collateral.ak`:
    1. The following input utxos must be present:
        1. 1 from the `collateral` contract (the one to be liquidated)
        2. 1 from the `position_registry` contract (_position UTXO_)
    2. The _global settings_ UTXO, and the _oracle price_ UTXO must be included in the _reference_ inputs.
    3. The collateral utxo must contain a _position token_.
    4. The _position token_ contained in the position UTXO must be the same as that contained in the collateral UTXO.
    5. The price data contained in the oracle UTXO must be updated.
    6. The loan position must be elligible for liquidation, for either of the following reasons:
        1. It has become overdue, or
        2. Its value has fallen below the requirement to secure the position.
    7. The collateral value must be sent to one of the supported dexes' order contract for swapping into the loanable asset.
    8. The swap order's `success_receiver` must be the `collateral` contract.
    9. The swap order's `success_receiver_datum` must contain the hash of the position token; so that we can identify the resulting UTXO later, after the swap is executed.
    10. The position token pair must be returned to the `position_registry` contract.
    11. The position utxo datum must be updated to contain the key hash of the liquidator.
    12. The tx must be signed by the liquidator indicated in the updated position utxo datum.
    13. The tx validity range must be within the specified period in the lending pool settings.

    Enforced by `position_registry.ak`:
    14. The correct collateral UTXO must be one of the inputs, containing the same _position token_ as the one in the position UTXO.

- Part 2: **From the dex swap proceeds, _liquidator_ repays the loan + interest**

    Redeemer: `SettleLiquidation`
    
    Enforced by `lending_pool.ak`:
    1. The following utxos must be included in the tx inputs:
        1. 1 from the `collateral` contract (the swap result)
        2. 1 from the `position_registry` contract (_position UTXO_)
        3. 1 from the `lending_pool` contract (_pool UTXO_)
    2. The _global settings_ UTXO must be included in the _reference_ inputs.
    3. The collateral input must contain a datum hash matching the hash of the position token in the position UTXO.
    4. The output lending pool utxo must be validated:
        1. that its datum does not change
        2. that the amount of the loanable asset it contains is the total of:
            1. The amount contained in the input lender utxo
            2. The borrowed amount
            3. The interest amount
        3. that it is going back to the `lending_pool` contract 
    5. The tx is signed by the liquidator
    6. The position token pair is burned

    Enforced by `collateral.ak`:
    7. A utxo from the `lending_pool` contract must be spent in the transaction.

    Enforced by `position_registry.ak`:
    8. A utxo from the `lending_pool` contract must be spent in the transaction.


### Requirements for minting/burning oracle beacon tokens

Redeemer: `MintOracleBeacon` | `BurnOracleToken`

Enforced by `oracle.ak`:
1. The _global settings_ UTXO must be included in the reference inputs.
2. The _global settings_ UTXO must contain the global settings beacon token.
3. The admin specified in the input _global settings_ UTXO must sign the tx.


### Requirements when updating oracle price data

Redeemer: `UpdateOraclePrice`

Enforced by `oracle.ak`:
1. The oracle price UTXO must be one of the inputs
2. The _oracle settings_ UTXO must be included in the reference inputs
3. The oracle price UTXO must be returned with its updated datum still having the same structure.
4. The tx must be signed by one of the authorized updaters.


### Requirements when updating audit datum

Redeemer: `UpdateAuditDatum`

Enforced by `audit.ak`:
1. The current audit UTXO containing the audit beacon token must be spent in the tx.
2. The following UTXOs must be included in the reference inputs:
    1. the _global settings_ UTXO
    2. the _oracle settings_ UTXO
    3. the `lending_pool` UTXO
    4. the oracle price UTXO
3. The output audit UTXO must be returned to the `audit` contract
4. The output audit datum must have the expected structure and contents
5. The tx must be signed by one of the trusted oracle providers


### Requirements when updating global settings

Redeemer: `UpdateGlobalCfg`

Enforced by `settings.ak`:

1. The _global settings_ UTXO must be spent in the tx.
2. The _global settings_ UTXO must contain the global settings beacon token.
3. The global settings beacon token must be returned to the `settings` contract.
4. The admin specified in the input _global settings_ UTXO must sign the tx.


### Requirements when updating oracle settings

Redeemer: `UpdateOracleCfg`

Enforced by `settings.ak`:
1. The _oracle settings_ UTXO must be spent in the tx.
2. The _oracle settings_ UTXO must contain the oracle settings beacon token.
3. The _global settings_ UTXO must be included in the reference inputs.
4. The _global settings_ UTXO must contain the global settings beacon token.
5. The oracle settings beacon token must be returned to the `settings` contract.
6. The oracle settings datum structure must be preserved.
7. The admin specified in the _global settings_ UTXO datum must sign the tx.


### Requirements when minting/burning position tokens

- **Minting**

    Enforced by `lending_pool.ak`:
    
    1. There must be 1 input utxo from the `lending_pool` contract. This triggers all the validation requirements already.

- **Burning**

    Enforced by `lending_pool.ak`:
    
    2. There must be 1 input utxo from the `lending_pool` contract. This triggers all the validation requirements already.


## References Used
- [Aiken Docs](https://aiken-lang.org/)
- [Aiken Standard Library](https://github.com/aiken-lang/stdlib/)
- [Strike Finance Forwards](https://github.com/strike-finance/forwards-smart-contracts/)
- [Minswap Dex V2](https://github.com/minswap/minswap-dex-v2/)
