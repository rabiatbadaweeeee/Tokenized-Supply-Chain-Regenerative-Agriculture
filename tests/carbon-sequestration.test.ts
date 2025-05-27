// Carbon Sequestration Contract Tests
import { describe, it, expect, beforeEach } from "vitest"

// Mock contract state
let contractState = {
  carbonData: new Map(),
  carbonCredits: new Map(),
  farmCarbonMeasurements: new Map(),
  farmCreditCount: new Map(),
  authorizedAssessors: new Map(),
  contractOwner: "SP1234567890",
  currentBlockHeight: 1000,
}

// Mock contract functions
const carbonContract = {
  recordCarbonMeasurement: (sender, farmId, soilCarbon, biomassCarbon, sequestrationRate, measurementMethod) => {
    const measurementCount = contractState.farmCarbonMeasurements.get(farmId) || 0
    const measurementId = measurementCount + 1
    const isAssessor = contractState.authorizedAssessors.get(sender) || sender === contractState.contractOwner
    
    if (!isAssessor) return { err: 400 } // owner only
    
    const measurementKey = `${farmId}-${measurementId}`
    contractState.carbonData.set(measurementKey, {
      soilCarbon,
      biomassCarbon,
      sequestrationRate,
      measurementMethod,
      measuredAt: contractState.currentBlockHeight,
      measurer: sender,
    })
    
    contractState.farmCarbonMeasurements.set(farmId, measurementId)
    return { ok: measurementId }
  },
  
  issueCarbonCredits: (sender, farmId, amount, pricePerTon) => {
    if (sender !== contractState.contractOwner) return { err: 400 }
    if (amount <= 0) return { err: 402 } // invalid data
    
    const creditCount = contractState.farmCreditCount.get(farmId) || 0
    const creditId = creditCount + 1
    const validUntil = contractState.currentBlockHeight + 52560 // ~1 year
    
    const creditKey = `${farmId}-${creditId}`
    contractState.carbonCredits.set(creditKey, {
      amount,
      issuedAt: contractState.currentBlockHeight,
      validUntil,
      pricePerTon,
      isSold: false,
      buyer: null,
    })
    
    contractState.farmCreditCount.set(farmId, creditId)
    return { ok: creditId }
  },
  
  purchaseCredits: (sender, farmId, creditId) => {
    const creditKey = `${farmId}-${creditId}`
    const credit = contractState.carbonCredits.get(creditKey)
    
    if (!credit) return { err: 401 } // not found
    if (credit.isSold) return { err: 403 } // already sold
    if (contractState.currentBlockHeight > credit.validUntil) return { err: 404 } // expired
    
    credit.isSold = true
    credit.buyer = sender
    
    return { ok: true }
  },
  
  addAssessor: (sender, assessor) => {
    if (sender !== contractState.contractOwner) return { err: 400 }
    contractState.authorizedAssessors.set(assessor, true)
    return { ok: true }
  },
  
  getCarbonMeasurement: (farmId, measurementId) => {
    const measurementKey = `${farmId}-${measurementId}`
    return contractState.carbonData.get(measurementKey) || null
  },
  
  getCarbonCredit: (farmId, creditId) => {
    const creditKey = `${farmId}-${creditId}`
    return contractState.carbonCredits.get(creditKey) || null
  },
  
  getTotalSequestration: (farmId) => {
    const latestMeasurementId = contractState.farmCarbonMeasurements.get(farmId)
    if (!latestMeasurementId) return null
    
    const measurementKey = `${farmId}-${latestMeasurementId}`
    const measurement = contractState.carbonData.get(measurementKey)
    if (!measurement) return null
    
    return measurement.soilCarbon + measurement.biomassCarbon
  },
}

describe("Carbon Sequestration Contract", () => {
  beforeEach(() => {
    contractState = {
      carbonData: new Map(),
      carbonCredits: new Map(),
      farmCarbonMeasurements: new Map(),
      farmCreditCount: new Map(),
      authorizedAssessors: new Map(),
      contractOwner: "SP1234567890",
      currentBlockHeight: 1000,
    }
  })
  
  describe("Carbon Measurement Recording", () => {
    it("should record carbon measurement successfully", () => {
      const result = carbonContract.recordCarbonMeasurement(
          contractState.contractOwner,
          1, // farmId
          15000, // soilCarbon (150 tons CO2e)
          8000, // biomassCarbon (80 tons CO2e)
          2500, // sequestrationRate (25 tons/year)
          "field-sampling",
      )
      
      expect(result.ok).toBe(1)
      
      const measurement = carbonContract.getCarbonMeasurement(1, 1)
      expect(measurement.soilCarbon).toBe(15000)
      expect(measurement.biomassCarbon).toBe(8000)
      expect(measurement.sequestrationRate).toBe(2500)
      expect(measurement.measurementMethod).toBe("field-sampling")
      expect(measurement.measurer).toBe(contractState.contractOwner)
    })
    
    it("should allow authorized assessors to record measurements", () => {
      const assessor = "SP3333333333"
      carbonContract.addAssessor(contractState.contractOwner, assessor)
      
      const result = carbonContract.recordCarbonMeasurement(assessor, 1, 12000, 6000, 2000, "remote-sensing")
      
      expect(result.ok).toBe(1)
      
      const measurement = carbonContract.getCarbonMeasurement(1, 1)
      expect(measurement.measurer).toBe(assessor)
    })
    
    it("should reject measurements from unauthorized users", () => {
      const result = carbonContract.recordCarbonMeasurement("SP9999999999", 1, 12000, 6000, 2000, "field-sampling")
      
      expect(result.err).toBe(400) // owner only error
    })
  })
  
  describe("Carbon Credits Issuance", () => {
    beforeEach(() => {
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 1, 15000, 8000, 2500, "field-sampling")
    })
    
    it("should issue carbon credits successfully", () => {
      const result = carbonContract.issueCarbonCredits(
          contractState.contractOwner,
          1, // farmId
          5000, // amount (50 tons CO2e)
          100000, // pricePerTon (microSTX)
      )
      
      expect(result.ok).toBe(1)
      
      const credit = carbonContract.getCarbonCredit(1, 1)
      expect(credit.amount).toBe(5000)
      expect(credit.pricePerTon).toBe(100000)
      expect(credit.isSold).toBe(false)
      expect(credit.buyer).toBeNull()
    })
    
    it("should reject issuance from non-owner", () => {
      const result = carbonContract.issueCarbonCredits("SP9999999999", 1, 5000, 100000)
      
      expect(result.err).toBe(400) // owner only
    })
    
    it("should reject zero or negative amounts", () => {
      const result = carbonContract.issueCarbonCredits(contractState.contractOwner, 1, 0, 100000)
      
      expect(result.err).toBe(402) // invalid data
    })
    
    it("should set correct validity period", () => {
      carbonContract.issueCarbonCredits(contractState.contractOwner, 1, 5000, 100000)
      
      const credit = carbonContract.getCarbonCredit(1, 1)
      expect(credit.validUntil).toBe(contractState.currentBlockHeight + 52560)
    })
  })
  
  describe("Carbon Credits Purchase", () => {
    beforeEach(() => {
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 1, 15000, 8000, 2500, "field-sampling")
      carbonContract.issueCarbonCredits(contractState.contractOwner, 1, 5000, 100000)
    })
    
    it("should purchase credits successfully", () => {
      const buyer = "SP5555555555"
      const result = carbonContract.purchaseCredits(buyer, 1, 1)
      
      expect(result.ok).toBe(true)
      
      const credit = carbonContract.getCarbonCredit(1, 1)
      expect(credit.isSold).toBe(true)
      expect(credit.buyer).toBe(buyer)
    })
    
    it("should reject purchase of non-existent credits", () => {
      const result = carbonContract.purchaseCredits("SP5555555555", 999, 1)
      
      expect(result.err).toBe(401) // not found
    })
    
    it("should reject purchase of already sold credits", () => {
      carbonContract.purchaseCredits("SP5555555555", 1, 1) // first purchase
      const result = carbonContract.purchaseCredits("SP6666666666", 1, 1) // second attempt
      
      expect(result.err).toBe(403) // already sold
    })
    
    it("should reject purchase of expired credits", () => {
      // Simulate time passage beyond validity
      contractState.currentBlockHeight = 60000
      
      const result = carbonContract.purchaseCredits("SP5555555555", 1, 1)
      
      expect(result.err).toBe(404) // expired
    })
  })
  
  describe("Assessor Management", () => {
    it("should allow owner to add assessors", () => {
      const result = carbonContract.addAssessor(contractState.contractOwner, "SP3333333333")
      
      expect(result.ok).toBe(true)
      expect(contractState.authorizedAssessors.get("SP3333333333")).toBe(true)
    })
    
    it("should reject non-owner attempts to add assessors", () => {
      const result = carbonContract.addAssessor("SP9999999999", "SP3333333333")
      
      expect(result.err).toBe(400)
    })
  })
  
  describe("Total Sequestration Calculation", () => {
    it("should calculate total sequestration correctly", () => {
      carbonContract.recordCarbonMeasurement(
          contractState.contractOwner,
          1,
          15000, // soil carbon
          8000, // biomass carbon
          2500,
          "field-sampling",
      )
      
      const total = carbonContract.getTotalSequestration(1)
      expect(total).toBe(23000) // 15000 + 8000
    })
    
    it("should return null for farm with no measurements", () => {
      const total = carbonContract.getTotalSequestration(999)
      expect(total).toBeNull()
    })
    
    it("should return latest measurement for farms with multiple records", () => {
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 1, 10000, 5000, 2000, "method1")
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 1, 15000, 8000, 2500, "method2")
      
      const total = carbonContract.getTotalSequestration(1)
      expect(total).toBe(23000) // latest measurement: 15000 + 8000
    })
  })
  
  describe("Multiple Farm Support", () => {
    it("should handle measurements for multiple farms independently", () => {
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 1, 15000, 8000, 2500, "method1")
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 2, 12000, 6000, 2000, "method2")
      
      const farm1Total = carbonContract.getTotalSequestration(1)
      const farm2Total = carbonContract.getTotalSequestration(2)
      
      expect(farm1Total).toBe(23000)
      expect(farm2Total).toBe(18000)
    })
    
    it("should issue credits for multiple farms independently", () => {
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 1, 15000, 8000, 2500, "method1")
      carbonContract.recordCarbonMeasurement(contractState.contractOwner, 2, 12000, 6000, 2000, "method2")
      
      carbonContract.issueCarbonCredits(contractState.contractOwner, 1, 5000, 100000)
      carbonContract.issueCarbonCredits(contractState.contractOwner, 2, 3000, 80000)
      
      const farm1Credit = carbonContract.getCarbonCredit(1, 1)
      const farm2Credit = carbonContract.getCarbonCredit(2, 1)
      
      expect(farm1Credit.amount).toBe(5000)
      expect(farm2Credit.amount).toBe(3000)
    })
  })
})

console.log("Running Carbon Sequestration Contract Tests...")
