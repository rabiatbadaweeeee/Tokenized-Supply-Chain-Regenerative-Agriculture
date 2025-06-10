;; Carbon Sequestration Contract
;; Quantifies carbon storage benefits

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u400))
(define-constant err-not-found (err u401))
(define-constant err-invalid-data (err u402))

;; Carbon data structure
(define-map carbon-data
  { farm-id: uint, measurement-id: uint }
  {
    soil-carbon: uint, ;; tons CO2e * 100
    biomass-carbon: uint, ;; tons CO2e * 100
    sequestration-rate: uint, ;; tons CO2e per year * 100
    measurement-method: (string-ascii 50),
    measured-at: uint,
    measurer: principal
  }
)

;; Carbon credits issued
(define-map carbon-credits
  { farm-id: uint, credit-id: uint }
  {
    amount: uint, ;; tons CO2e * 100
    issued-at: uint,
    valid-until: uint,
    price-per-ton: uint, ;; microSTX
    is-sold: bool,
    buyer: (optional principal)
  }
)

;; Measurement counter per farm
(define-map farm-carbon-measurements uint uint)

;; Credit counter per farm
(define-map farm-credit-count uint uint)

;; Authorized carbon assessors
(define-map authorized-assessors principal bool)

;; Record carbon measurement
(define-public (record-carbon-measurement
  (farm-id uint)
  (soil-carbon uint)
  (biomass-carbon uint)
  (sequestration-rate uint)
  (measurement-method (string-ascii 50))
)
  (let
    (
      (measurement-count (default-to u0 (map-get? farm-carbon-measurements farm-id)))
      (measurement-id (+ measurement-count u1))
      (is-assessor (default-to false (map-get? authorized-assessors tx-sender)))
    )
    (asserts! (or is-assessor (is-eq tx-sender contract-owner)) err-owner-only)
    (map-set carbon-data
      { farm-id: farm-id, measurement-id: measurement-id }
      {
        soil-carbon: soil-carbon,
        biomass-carbon: biomass-carbon,
        sequestration-rate: sequestration-rate,
        measurement-method: measurement-method,
        measured-at: block-height,
        measurer: tx-sender
      }
    )
    (map-set farm-carbon-measurements farm-id measurement-id)
    (ok measurement-id)
  )
)

;; Issue carbon credits
(define-public (issue-carbon-credits (farm-id uint) (amount uint) (price-per-ton uint))
  (let
    (
      (credit-count (default-to u0 (map-get? farm-credit-count farm-id)))
      (credit-id (+ credit-count u1))
      (valid-until (+ block-height u52560)) ;; ~1 year validity
    )
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (> amount u0) err-invalid-data)
    (map-set carbon-credits
      { farm-id: farm-id, credit-id: credit-id }
      {
        amount: amount,
        issued-at: block-height,
        valid-until: valid-until,
        price-per-ton: price-per-ton,
        is-sold: false,
        buyer: none
      }
    )
    (map-set farm-credit-count farm-id credit-id)
    (ok credit-id)
  )
)

;; Purchase carbon credits
(define-public (purchase-credits (farm-id uint) (credit-id uint))
  (let
    (
      (credit (unwrap! (map-get? carbon-credits { farm-id: farm-id, credit-id: credit-id }) err-not-found))
    )
    (asserts! (not (get is-sold credit)) (err u403))
    (asserts! (<= block-height (get valid-until credit)) (err u404))
    ;; In a real implementation, handle STX payment here
    (map-set carbon-credits
      { farm-id: farm-id, credit-id: credit-id }
      (merge credit {
        is-sold: true,
        buyer: (some tx-sender)
      })
    )
    (ok true)
  )
)

;; Add authorized carbon assessor
(define-public (add-assessor (assessor principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (map-set authorized-assessors assessor true)
    (ok true)
  )
)

;; Get carbon measurement
(define-read-only (get-carbon-measurement (farm-id uint) (measurement-id uint))
  (map-get? carbon-data { farm-id: farm-id, measurement-id: measurement-id })
)

;; Get carbon credit details
(define-read-only (get-carbon-credit (farm-id uint) (credit-id uint))
  (map-get? carbon-credits { farm-id: farm-id, credit-id: credit-id })
)

;; Calculate total sequestration for farm
(define-read-only (get-total-sequestration (farm-id uint))
  (let
    (
      (latest-measurement-id (default-to u0 (map-get? farm-carbon-measurements farm-id)))
    )
    (if (> latest-measurement-id u0)
      (match (map-get? carbon-data { farm-id: farm-id, measurement-id: latest-measurement-id })
        measurement (some (+ (get soil-carbon measurement) (get biomass-carbon measurement)))
        none
      )
      none
    )
  )
)
