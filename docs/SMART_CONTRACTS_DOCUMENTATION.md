# Smart Contract Documentation

## Overview

The DeFi Lending Smart Contracts consists of 6 main validators that work together to form a complete set of primitives needed to build institutional-grade DeFi protocols. Each validator has a specific role and manages certain UTXOs within the protocol architecture.

Key template features:

### **Modular Design**
- Each validator can be customized independently
- Clear separation of concerns
- Extensible architecture for additional features

### **Security by Design**
- Battle-tested patterns for common attack vectors
- Comprehensive validation logic
- Multi-signature and role-based access control

### **Efficiency Optimizations**
- Reference script usage to minimize transaction sizes
- Single UTXO pool design for optimal concurrency
- Input indexing for reduced computation costs

### **Integration Ready**
- Standard interfaces for DEX integration
- Oracle provider framework
- Off-chain infrastructure included

---

## 1. Settings Validator (`settings.ak`)

### **Purpose**
Manages global protocol configuration settings, including oracle settings and admin permissions.

### **Managed UTXOs**
- **Global Settings UTXO**: Contains core protocol configuration
- **Oracle Settings UTXO**: Contains oracle provider list and configuration

### **Main Functions**

#### **Minting/Burning Operations**
- `MintSettingsBeacons`: Initializes the protocol by minting the first beacon tokens
- `BurnSettingsBeacons`: Decommissions the protocol by burning all beacon tokens

#### **Configuration Updates**
- `UpdateGlobalCfg`: Updates global protocol settings (admin only)
- `UpdateOracleCfg`: Updates oracle provider list (admin only)

### **Security Measures**
- All critical operations require admin signature
- Beacon token validation for UTXO identification
- Withdrawal-based validation for burn operations

### **Data Structures**
```aiken
pub type SettingsDatum {
  GlobalSettings {
    admin_key_hash: VerificationKeyHash,
    pool_contract: ScriptHash,
    collateral_ratio: Int,
    max_tx_validity: Int,
    liquidation_dexes: List<LiquidationDex>,
    // ... additional fields
  }
  OracleSettings {
    oracle_contract: ScriptHash,
    providers: List<Signer>,
  }
}
```

---

## 2. Collateral Validator (`collateral.ak`)

### **Purpose**
Manages all user collateral and their status throughout the lending process.

### **Managed UTXOs**
Each collateral UTXO belongs to a user and contains:
- Collateral assets (typically ADA)
- Status information (Available, LoanRequested, LoanIssued, RepayRequested)
- Owner address

### **Main Functions**

#### **User Operations**
- `WithdrawCollateral`: Withdraw available collateral
- `BorrowRequest`: Submit loan request (Phase 1)
- `RepayRequest`: Submit repayment request (Phase 1)

#### **System Operations**
- `BorrowProcess`: Process loan issuance (Phase 2)
- `RepayProcess`: Process loan repayment (Phase 2)
- `LiquidateCollateral`: Initiate liquidation
- `SettleLiquidation`: Complete liquidation

### **Status Management**
```aiken
pub type CollateralStatus {
  Available                             // Freely available
  LoanRequested { request: LoanRequest } // Loan request submitted
  LoanIssued                           // Loan active, locked
  RepayRequested                       // Repayment request submitted
}
```

### **Security Measures**
- Owner signature required for all user actions
- Position token validation for loan operations
- Oracle price data validation for liquidations
- Two-phase transaction pattern for concurrency protection

---

## 3. Lending Pool Validator (`lending_pool.ak`)

### **Purpose**
Manages the central pool of loanable assets and coordinates all lending operations.

### **Managed UTXOs**
- **Single Pool UTXO**: Contains all loanable assets (concurrency design)
- **Position Tokens**: Minting policy for unique loan identification

### **Main Functions**

#### **Minting Operations**
- Mint position token pairs for new loans
- Burn position token pairs when loans are closed

#### **Loan Operations**
- `BorrowProcess`: Loan issuance with collateral validation
- `RepayProcess`: Loan repayment with interest calculation
- `SettleLiquidation`: Liquidation settlement

#### **Admin Operations**
- `WithdrawLendingPool`: Pool withdrawal (decommissioning)

### **Concurrency Solution**
The protocol uses a single pool UTXO to prevent double-satisfaction attacks. User interactions are split into two phases:
1. **Request Phase**: User modifies only their own collateral UTXO
2. **Process Phase**: System processes request through pool UTXO transaction

### **Validation Logic**
- Oracle price data validation
- Collateral ratio verification
- Position token uniqueness
- Interest calculation and validation

---

## 4. Position Registry Validator (`position_registry.ak`)

### **Purpose**
Manages metadata for all active loan positions as separate UTXOs.

### **Managed UTXOs**
Each position UTXO contains:
- Borrower address
- Complete loan metadata
- Position token identification
- Optional liquidator information

### **Main Functions**

#### **Lifecycle Management**
- `RepayProcess`: Position UTXO is removed upon repayment
- `LiquidateCollateral`: Position is marked for liquidation
- `SettleLiquidation`: Position is removed after liquidation

### **Data Structure**
```aiken
pub type PositionRegistryDatum {
  borrower: Address,
  loan: LoanDatum {
    collateral_asset: AssetClass,
    borrowed_asset: AssetClass,
    collateral_amt: Int,
    borrowed_amt: Int,
    interest_amt: Int,
    loan_term: Int,
    maturity: PosixTime,
  },
  pos_id: AssetName,
  liquidator: Option<Signer>,
}
```

### **Security Measures**
- Position token matching with collateral UTXOs
- Lending pool interaction validation
- Consistency checks between position and collateral

---

## 5. Oracle Validator (`oracle.ak`)

### **Purpose**
Manages price data for collateral assets through trusted providers.

### **Managed UTXOs**
- **Price UTXOs**: Contain current price data with timestamps
- **Oracle Beacon Tokens**: Identification of official price UTXOs

### **Main Functions**

#### **Price Management**
- `UpdateOraclePrice`: Price data update by providers
- `MintOracleBeacon`: Create new price UTXOs (admin)
- `BurnOracleBeacon`: Remove price UTXOs (admin)

### **Price Data Structure**
```aiken
pub type OracleDatum {
  timestamp: PosixTime,
  validity_period: Int,
  quoted_asset: AssetClass,      // Collateral asset
  denomination: AssetClass,      // Loanable asset
  price: QuotePrice,            // (price, decimal_digits)
  consumers: List<Signer>,
}
```

### **Security Measures**
- Multi-provider system with trusted signatures
- Price data staleness validation
- Admin control over provider list
- Timestamp-based validity checks

---

## 6. Audit Validator (`audit.ak`)

### **Purpose**
Monitors the health of the entire protocol by calculating key metrics.

### **Managed UTXOs**
- **Single Audit UTXO**: Contains protocol-wide health metrics

### **Main Functions**

#### **Health Monitoring**
- `UpdateAuditDatum`: Calculates and updates health score
- Monitors total collateral vs. total loans
- Calculates utilization rates

### **Metrics**
```aiken
pub type AuditDatum {
  timestamp: PosixTime,
  collateral_asset: AssetClass,
  loanable_asset: AssetClass,
  collateral_ratio: Int,
  total_collateral: Int,
  total_borrowed: Int,
  health_score: (Int, Int),        // (numerator, denominator)
  utilization_rate: (Int, Int),    // (numerator, denominator)
}
```

### **Calculation Logic**
- **Health Score**: Ratio of total collateral value to total loans
- **Utilization Rate**: Proportion of lent assets to total pool
- Automatic calculation based on current oracle prices

### **Security Measures**
- Only trusted oracle providers can perform updates
- Validation of all reference UTXOs (pool, oracle, settings)
- Mathematical correctness of calculations is enforced

---

## Additional: Reference Scripts Validator (`refscripts.ak`)

### **Purpose**
Simple validator for secure storage of all compiled validator codes as reference scripts.

### **Main Functions**
- Provides reference scripts for all other validators
- Reduces transaction sizes through script referencing
- Admin-controlled deployment/undeployment operations

### **Security Measures**
- Admin signature required for all operations
- Withdrawal-based spend validation

---

## Overall Architecture

### **Interaction Patterns**
1. **Two-Phase Transactions**: Request → Process for concurrency protection
2. **Beacon Token System**: Unique identification of critical UTXOs
3. **Position Token Linking**: Connection between collateral and registry UTXOs
4. **Reference Script Pattern**: Efficient script reuse

### **Security Concepts**
1. **Input Indexing**: Reduces double-satisfaction risks
2. **Oracle Validation**: Multi-provider price data verification
3. **Role-based Access**: Admin vs. Provider vs. User permissions
4. **Mathematical Validation**: Correct calculations are enforced

## Liquidation System

### **Two-Phase Liquidation Process**

#### **Phase 1: Initiate Liquidation (`LiquidateCollateral`)**
- Liquidator identifies undercollateralized or overdue position
- Validates liquidation eligibility through oracle price data
- Creates DEX swap order to convert collateral to loanable asset
- Updates position registry with liquidator information
- Requires liquidator signature

#### **Phase 2: Settle Liquidation (`SettleLiquidation`)**
- Processes DEX swap results
- Repays loan principal + interest to lending pool
- Distributes remaining proceeds to liquidator
- Burns position tokens and removes position from registry
- Requires liquidator signature

### **Liquidation Eligibility**
A position becomes eligible for liquidation when:
1. **Undercollateralized**: Current collateral value falls below required ratio
2. **Overdue**: Loan has passed its maturity date

### **DEX Integration**
- Supports multiple DEXes (Minswap, SundaeSwap, WingRiders)
- Automated market orders for collateral liquidation
- Slippage protection and order validation
