import { getGenericLimits, MS_PER_HOUR } from "@config/app"
import { generateTokenHelper, getAndCreateUserWallet } from "test/helpers"
import { WalletsRepository } from "@services/mongoose"
import { Accounts } from "@app"
import { CsvWalletsExport } from "@services/ledger/csv-wallet-export"

let userWallet0, userWallet1, userWallet2
const username = "user0" as Username

describe("UserWallet", () => {
  beforeAll(async () => {
    userWallet0 = await getAndCreateUserWallet(0)
    userWallet1 = await getAndCreateUserWallet(1)
    userWallet2 = await getAndCreateUserWallet(2)
    // load funder wallet before use it
    await getAndCreateUserWallet(4)

    // load edit for admin-panel manual testing
    await getAndCreateUserWallet(13)
  })

  it("has a role if it was configured", async () => {
    const dealer = await getAndCreateUserWallet(6)
    expect(dealer.user.role).toBe("dealer")
  })

  it("has currencies if they were configured", async () => {
    const user5 = await getAndCreateUserWallet(5)
    expect(user5.user.currencies[0]).toMatchObject({ id: "USD", ratio: 1 })
  })

  it("has a title if it was configured", () => {
    expect(userWallet2.user.title).toBeTruthy()
  })

  it("does not allow withdraw if the user is new", () => {
    expect(userWallet2.user.oldEnoughForWithdrawal).toBeFalsy()

    // in 6 days:
    const genericLimits = getGenericLimits()
    const date =
      Date.now() + genericLimits.oldEnoughForWithdrawalMicroseconds - MS_PER_HOUR

    jest.spyOn(global.Date, "now").mockImplementationOnce(() => new Date(date).valueOf())

    expect(userWallet2.user.oldEnoughForWithdrawal).toBeFalsy()
  })

  it("allows withdraw if user is old enough", () => {
    expect(userWallet2.user.oldEnoughForWithdrawal).toBeFalsy()

    // TODO make this configurable
    // in 8 days:
    const genericLimits = getGenericLimits()
    const date =
      Date.now() + genericLimits.oldEnoughForWithdrawalMicroseconds + MS_PER_HOUR

    jest.spyOn(global.Date, "now").mockImplementationOnce(() => new Date(date).valueOf())

    expect(userWallet2.user.oldEnoughForWithdrawal).toBeTruthy()
  })

  describe("setUsername", () => {
    it("does not set username if length is less than 3", async () => {
      await expect(userWallet0.setUsername({ username: "ab" })).rejects.toThrow()
    })

    it("does not set username if contains invalid characters", async () => {
      await expect(userWallet0.setUsername({ username: "ab+/" })).rejects.toThrow()
    })

    it("does not allow non english characters", async () => {
      await expect(userWallet0.setUsername({ username: "ñ_user1" })).rejects.toThrow()
    })

    it("does not set username starting with 1, 3, bc1, lnbc1", async () => {
      await expect(userWallet0.setUsername({ username: "1ab" })).rejects.toThrow()
      await expect(userWallet0.setUsername({ username: "3basd" })).rejects.toThrow()
      await expect(userWallet0.setUsername({ username: "bc1ba" })).rejects.toThrow()
      await expect(userWallet0.setUsername({ username: "lnbc1qwe1" })).rejects.toThrow()
    })

    it("allows set username", async () => {
      let result = await userWallet0.setUsername({ username: "user0" })
      expect(!!result).toBeTruthy()
      result = await userWallet1.setUsername({ username: "user1" })
      expect(!!result).toBeTruthy()
      result = await userWallet2.setUsername({ username: "lily" })
      expect(!!result).toBeTruthy()
    })

    it("does not allow set username if already taken", async () => {
      await getAndCreateUserWallet(2)
      await expect(userWallet2.setUsername({ username })).rejects.toThrow()
    })

    it("does not allow set username with only case difference", async () => {
      await expect(userWallet2.setUsername({ username: "User1" })).rejects.toThrow()
    })

    it("does not allow re-setting username", async () => {
      await expect(userWallet0.setUsername({ username: "abc" })).rejects.toThrow()
    })
  })

  describe("usernameExists", () => {
    it("return true if username already exists", async () => {
      const walletsRepo = WalletsRepository()
      const wallet = await walletsRepo.findByUsername(username)
      expect(wallet).toStrictEqual(
        expect.objectContaining({
          id: expect.any(String),
        }),
      )
    })

    it("return true for other capitalization", async () => {
      const walletsRepo = WalletsRepository()
      const wallet = await walletsRepo.findByUsername(
        username.toLocaleUpperCase() as Username,
      )
      expect(wallet).toStrictEqual(
        expect.objectContaining({
          id: expect.any(String),
        }),
      )
    })

    it("return false if username does not exist", async () => {
      const walletsRepo = WalletsRepository()
      const wallet = await walletsRepo.findByUsername("user" as Username)
      expect(wallet).toBeInstanceOf(Error)
    })
  })

  describe("getStringCsv", () => {
    const csvHeader =
      "id,walletId,type,credit,debit,fee,currency,timestamp,pendingConfirmation,journalId,lnMemo,usd,feeUsd,recipientWalletId,username,memoFromPayer,paymentHash,pubkey,feeKnownInAdvance,address,txHash"
    it("exports to csv", async () => {
      const csv = new CsvWalletsExport()
      await csv.addWallet(userWallet0.user.walletId)
      const base64Data = csv.getBase64()
      expect(typeof base64Data).toBe("string")
      const data = Buffer.from(base64Data, "base64")
      expect(data.includes(csvHeader)).toBeTruthy()
    })
  })

  describe("updateAccountStatus", () => {
    it("sets account status for given user id", async () => {
      let user = await Accounts.updateAccountStatus({
        id: userWallet2.user.id,
        status: "locked",
      })
      if (user instanceof Error) {
        throw user
      }
      expect(user.status).toBe("locked")
      user = await Accounts.updateAccountStatus({ id: user.id, status: "active" })
      if (user instanceof Error) {
        throw user
      }
      expect(user.status).toBe("active")
    })
  })

  describe("save2fa", () => {
    it("saves 2fa for user0", async () => {
      const { secret } = userWallet0.generate2fa()
      const token = generateTokenHelper({ secret })
      await userWallet0.save2fa({ secret, token })
      userWallet0 = await getAndCreateUserWallet(0)
      expect(userWallet0.user.twoFAEnabled).toBe(true)
      expect(userWallet0.user.twoFA.secret).toBe(secret)
    })
  })

  describe("delete2fa", () => {
    it("delete 2fa for user0", async () => {
      const token = generateTokenHelper({ secret: userWallet0.user.twoFA.secret })
      const result = await userWallet0.delete2fa({ token })
      expect(result).toBeTruthy()
      userWallet0 = await getAndCreateUserWallet(0)
      expect(userWallet0.user.twoFAEnabled).toBeFalsy()
    })
  })
})
