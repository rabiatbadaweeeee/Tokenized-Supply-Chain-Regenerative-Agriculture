;; Biodiversity Measurement Contract
;; Tracks ecosystem restoration

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u300))
(define-constant err-not-found (err u301))

;; Biodiversity data structure
(define-map biodiversity-data
  { farm-id: uint, survey-id: uint }
  {
    bird-species: uint,
    insect-species: uint,
    plant-species: uint,
    pollinator-count: uint,
    native-species-ratio: uint, ;; percentage * 100
    surveyed-at: uint,
    surveyor: principal
  }
)

;; Survey counter per farm
(define-map farm-survey-count uint uint)

;; Authorized surveyors
(define-map authorized-surveyors principal bool)

;; Record biodiversity survey
(define-public (record-survey
  (farm-id uint)
  (bird-species uint)
  (insect-species uint)
  (plant-species uint)
  (pollinator-count uint)
  (native-species-ratio uint)
)
  (let
    (
      (survey-count (default-to u0 (map-get? farm-survey-count farm-id)))
      (survey-id (+ survey-count u1))
      (is-surveyor (default-to false (map-get? authorized-surveyors tx-sender)))
    )
    (asserts! (or is-surveyor (is-eq tx-sender contract-owner)) err-owner-only)
    (asserts! (<= native-species-ratio u10000) (err u302)) ;; max 100%
    (map-set biodiversity-data
      { farm-id: farm-id, survey-id: survey-id }
      {
        bird-species: bird-species,
        insect-species: insect-species,
        plant-species: plant-species,
        pollinator-count: pollinator-count,
        native-species-ratio: native-species-ratio,
        surveyed-at: block-height,
        surveyor: tx-sender
      }
    )
    (map-set farm-survey-count farm-id survey-id)
    (ok survey-id)
  )
)

;; Calculate biodiversity score (0-100)
(define-read-only (calculate-biodiversity-score (farm-id uint) (survey-id uint))
  (match (map-get? biodiversity-data { farm-id: farm-id, survey-id: survey-id })
    survey
    (let
      (
        (species-diversity (+ (get bird-species survey)
                            (get insect-species survey)
                            (get plant-species survey)))
        (diversity-score (if (>= species-diversity u100) u30
                           (/ (* species-diversity u30) u100)))
        (pollinator-score (if (>= (get pollinator-count survey) u50) u30
                            (/ (* (get pollinator-count survey) u30) u50)))
        (native-score (/ (get native-species-ratio survey) u100)) ;; max 40 points
      )
      (some (+ diversity-score pollinator-score native-score))
    )
    none
  )
)

;; Add authorized surveyor
(define-public (add-surveyor (surveyor principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (map-set authorized-surveyors surveyor true)
    (ok true)
  )
)

;; Get survey data
(define-read-only (get-survey (farm-id uint) (survey-id uint))
  (map-get? biodiversity-data { farm-id: farm-id, survey-id: survey-id })
)

;; Get latest survey for farm
(define-read-only (get-latest-survey (farm-id uint))
  (let
    (
      (latest-id (default-to u0 (map-get? farm-survey-count farm-id)))
    )
    (if (> latest-id u0)
      (map-get? biodiversity-data { farm-id: farm-id, survey-id: latest-id })
      none
    )
  )
)
