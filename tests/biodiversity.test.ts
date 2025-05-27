// Biodiversity Measurement Contract Tests
import { describe, it, expect, beforeEach } from "vitest"

// Mock contract state
let contractState = {
  biodiversityData: new Map(),
  farmSurveyCount: new Map(),
  authorizedSurveyors: new Map(),
  contractOwner: "SP1234567890",
}

// Mock contract functions
const biodiversityContract = {
  recordSurvey: (sender, farmId, birdSpecies, insectSpecies, plantSpecies, pollinatorCount, nativeSpeciesRatio) => {
    const surveyCount = contractState.farmSurveyCount.get(farmId) || 0
    const surveyId = surveyCount + 1
    const isSurveyor = contractState.authorizedSurveyors.get(sender) || sender === contractState.contractOwner
    
    if (!isSurveyor) return { err: 300 } // owner only
    if (nativeSpeciesRatio > 10000) return { err: 302 } // max 100%
    
    const surveyKey = `${farmId}-${surveyId}`
    contractState.biodiversityData.set(surveyKey, {
      birdSpecies,
      insectSpecies,
      plantSpecies,
      pollinatorCount,
      nativeSpeciesRatio,
      surveyedAt: Date.now(),
      surveyor: sender,
    })
    
    contractState.farmSurveyCount.set(farmId, surveyId)
    return { ok: surveyId }
  },
  
  calculateBiodiversityScore: (farmId, surveyId) => {
    const surveyKey = `${farmId}-${surveyId}`
    const survey = contractState.biodiversityData.get(surveyKey)
    
    if (!survey) return null
    
    const speciesDiversity = survey.birdSpecies + survey.insectSpecies + survey.plantSpecies
    const diversityScore = Math.min(Math.floor((speciesDiversity * 30) / 100), 30)
    const pollinatorScore = Math.min(Math.floor((survey.pollinatorCount * 30) / 50), 30)
    const nativeScore = Math.floor(survey.nativeSpeciesRatio / 100) // max 40 points
    
    return diversityScore + pollinatorScore + nativeScore
  },
  
  addSurveyor: (sender, surveyor) => {
    if (sender !== contractState.contractOwner) return { err: 300 }
    contractState.authorizedSurveyors.set(surveyor, true)
    return { ok: true }
  },
  
  getSurvey: (farmId, surveyId) => {
    const surveyKey = `${farmId}-${surveyId}`
    return contractState.biodiversityData.get(surveyKey) || null
  },
  
  getLatestSurvey: (farmId) => {
    const latestId = contractState.farmSurveyCount.get(farmId)
    if (!latestId) return null
    
    const surveyKey = `${farmId}-${latestId}`
    return contractState.biodiversityData.get(surveyKey) || null
  },
}

describe("Biodiversity Measurement Contract", () => {
  beforeEach(() => {
    contractState = {
      biodiversityData: new Map(),
      farmSurveyCount: new Map(),
      authorizedSurveyors: new Map(),
      contractOwner: "SP1234567890",
    }
  })
  
  describe("Survey Recording", () => {
    it("should record biodiversity survey successfully", () => {
      const result = biodiversityContract.recordSurvey(
          contractState.contractOwner,
          1, // farmId
          25, // birdSpecies
          75, // insectSpecies
          45, // plantSpecies
          60, // pollinatorCount
          8500, // nativeSpeciesRatio (85%)
      )
      
      expect(result.ok).toBe(1)
      
      const survey = biodiversityContract.getSurvey(1, 1)
      expect(survey.birdSpecies).toBe(25)
      expect(survey.insectSpecies).toBe(75)
      expect(survey.plantSpecies).toBe(45)
      expect(survey.pollinatorCount).toBe(60)
      expect(survey.nativeSpeciesRatio).toBe(8500)
      expect(survey.surveyor).toBe(contractState.contractOwner)
    })
    
    it("should allow authorized surveyors to record surveys", () => {
      const surveyor = "SP3333333333"
      biodiversityContract.addSurveyor(contractState.contractOwner, surveyor)
      
      const result = biodiversityContract.recordSurvey(surveyor, 1, 20, 50, 30, 40, 7000)
      
      expect(result.ok).toBe(1)
      
      const survey = biodiversityContract.getSurvey(1, 1)
      expect(survey.surveyor).toBe(surveyor)
    })
    
    it("should reject surveys from unauthorized users", () => {
      const result = biodiversityContract.recordSurvey("SP9999999999", 1, 20, 50, 30, 40, 7000)
      
      expect(result.err).toBe(300) // owner only error
    })
    
    it("should reject invalid native species ratio", () => {
      const result = biodiversityContract.recordSurvey(
          contractState.contractOwner,
          1,
          20,
          50,
          30,
          40,
          15000, // 150% - invalid
      )
      
      expect(result.err).toBe(302) // invalid ratio
    })
    
    it("should increment survey ID for multiple surveys", () => {
      biodiversityContract.recordSurvey(contractState.contractOwner, 1, 20, 50, 30, 40, 7000)
      const result2 = biodiversityContract.recordSurvey(contractState.contractOwner, 1, 25, 60, 35, 50, 8000)
      
      expect(result2.ok).toBe(2)
    })
  })
  
  describe("Biodiversity Score Calculation", () => {
    beforeEach(() => {
      biodiversityContract.recordSurvey(
          contractState.contractOwner,
          1,
          25, // birdSpecies
          75, // insectSpecies
          50, // plantSpecies
          60, // pollinatorCount
          8500, // nativeSpeciesRatio (85%)
      )
    })
    
    it("should calculate high biodiversity score for rich ecosystem", () => {
      const score = biodiversityContract.calculateBiodiversityScore(1, 1)
      
      // Expected: diversity(30) + pollinator(30) + native(85) = high score
      expect(score).toBeGreaterThan(100)
    })
    
    it("should calculate lower score for poor biodiversity", () => {
      biodiversityContract.recordSurvey(
          contractState.contractOwner,
          2,
          5, // low bird species
          15, // low insect species
          10, // low plant species
          15, // low pollinator count
          3000, // low native ratio (30%)
      )
      
      const score = biodiversityContract.calculateBiodiversityScore(2, 1)
      expect(score).toBeLessThan(50)
    })
    
    it("should return null for non-existent survey", () => {
      const score = biodiversityContract.calculateBiodiversityScore(999, 1)
      expect(score).toBeNull()
    })
  })
  
  describe("Surveyor Management", () => {
    it("should allow owner to add surveyors", () => {
      const result = biodiversityContract.addSurveyor(contractState.contractOwner, "SP3333333333")
      
      expect(result.ok).toBe(true)
      expect(contractState.authorizedSurveyors.get("SP3333333333")).toBe(true)
    })
    
    it("should reject non-owner attempts to add surveyors", () => {
      const result = biodiversityContract.addSurveyor("SP9999999999", "SP3333333333")
      
      expect(result.err).toBe(300)
    })
  })
  
  describe("Latest Survey Retrieval", () => {
    it("should return latest survey for farm", () => {
      biodiversityContract.recordSurvey(contractState.contractOwner, 1, 20, 50, 30, 40, 7000)
      biodiversityContract.recordSurvey(contractState.contractOwner, 1, 25, 60, 35, 50, 8000)
      
      const latest = biodiversityContract.getLatestSurvey(1)
      expect(latest.birdSpecies).toBe(25)
      expect(latest.insectSpecies).toBe(60)
      expect(latest.nativeSpeciesRatio).toBe(8000)
    })
    
    it("should return null for farm with no surveys", () => {
      const latest = biodiversityContract.getLatestSurvey(999)
      expect(latest).toBeNull()
    })
  })
  
  describe("Score Validation", () => {
    it("should handle edge cases in score calculation", () => {
      // Maximum diversity test
      biodiversityContract.recordSurvey(
          contractState.contractOwner,
          1,
          50,
          100,
          80,
          100,
          10000, // maximum values
      )
      
      const maxScore = biodiversityContract.calculateBiodiversityScore(1, 1)
      expect(maxScore).toBe(160) // 30 + 30 + 100
      
      // Minimum diversity test
      biodiversityContract.recordSurvey(
          contractState.contractOwner,
          2,
          0,
          0,
          0,
          0,
          0, // minimum values
      )
      
      const minScore = biodiversityContract.calculateBiodiversityScore(2, 1)
      expect(minScore).toBe(0)
    })
  })
})

console.log("Running Biodiversity Contract Tests...")
