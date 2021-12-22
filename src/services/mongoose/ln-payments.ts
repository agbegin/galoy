import { toMilliSatsFromString, toSats } from "@domain/bitcoin"
import {
  CouldNotFindLnPaymentFromHashError,
  UnknownRepositoryError,
} from "@domain/errors"
import { LnPayment } from "@services/lnd/schema"

export const LnPaymentsRepository = (): ILnPaymentsRepository => {
  const findByPaymentHash = async (
    paymentHash: PaymentHash,
  ): Promise<PersistedLnPaymentLookup | RepositoryError> => {
    try {
      const result = await LnPayment.findOne({ paymentHash })
      if (!result) {
        return new CouldNotFindLnPaymentFromHashError(paymentHash)
      }
      return lnPaymentFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const persist = async (
    payment: LnPaymentPartial,
  ): Promise<LnPaymentPartial | RepositoryError> => {
    try {
      const result = await LnPayment.findOneAndUpdate(
        { paymentHash: payment.paymentHash },
        payment,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      return lnPaymentPartialFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const update = async (
    payment: PersistedLnPaymentLookup,
  ): Promise<PersistedLnPaymentLookup | RepositoryError> => {
    try {
      const result = await LnPayment.findOneAndUpdate(
        { paymentHash: payment.paymentHash },
        payment,
        { new: true },
      )
      if (!result) return new CouldNotFindLnPaymentFromHashError()
      return lnPaymentFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  return {
    findByPaymentHash,
    persist,
    update,
  }
}

const lnPaymentFromRaw = (result: LnPaymentType): PersistedLnPaymentLookup => ({
  createdAt: result.createdAt,
  status: result.status as PaymentStatus,
  paymentHash: result.paymentHash as PaymentHash,
  paymentRequest: result.paymentRequest as EncodedPaymentRequest,
  milliSatsAmount: toMilliSatsFromString(result.milliSatsAmount),
  roundedUpAmount: toSats(result.roundedUpAmount),
  confirmedDetails: result.confirmedDetails
    ? {
        confirmedAt: result.confirmedDetails.confirmedAt,
        destination: result.confirmedDetails.destination,
        secret: result.confirmedDetails.secret,
        roundedUpFee: result.confirmedDetails.roundedUpFee,
        milliSatsFee: result.confirmedDetails.milliSatsFee,
        hopPubkeys: result.confirmedDetails.hopPubkeys,
      }
    : undefined,
  attempts: result.attempts,
  isCompleteRecord: result.isCompleteRecord,
})

const lnPaymentPartialFromRaw = (result: LnPaymentType): LnPaymentPartial => ({
  paymentHash: result.paymentHash as PaymentHash,
  paymentRequest: result.paymentRequest as EncodedPaymentRequest,
})
