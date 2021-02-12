/**
 * @jest-environment node
 */
import { filter, first } from "lodash";
import { quit } from "../lock";
import { MainBook, setupMongoConnection } from "../mongodb";
import { checkIsBalanced, getUserWallet, lndMain, lndOutside1, mockGetExchangeBalance, RANDOM_ADDRESS, waitUntilBlockHeight } from "../tests/helper";
import { onchainTransactionEventHandler } from "../trigger";
import { bitcoindDefaultClient, sleep } from "../utils";
const util = require('util')

const {once} = require('events');

const lnService = require('ln-service')

const mongoose = require("mongoose");

let initBlockCount
let initialBalanceUser0
let userWallet0, userWallet3


jest.mock('../notification')
const { sendNotification } = require("../notification");

beforeAll(async () => {
  await setupMongoConnection()
  userWallet0 = await getUserWallet(0)
  userWallet3 = await getUserWallet(3)
  mockGetExchangeBalance()
})

beforeEach(async () => {
  initBlockCount = await bitcoindDefaultClient.getBlockCount();
  ({BTC: initialBalanceUser0} = await userWallet0.getBalances())
})

afterEach(async () => {
  await checkIsBalanced()
})

afterAll(async () => {
  await bitcoindDefaultClient.generateToAddress(3, RANDOM_ADDRESS)
  await sleep(2000)
  jest.restoreAllMocks();
	await mongoose.connection.close()
	await quit()
})

const amount = 10040 // sats


it('testing Fee', async () => {
  {
    const address = await bitcoindDefaultClient.getNewAddress()
    const fee = await userWallet0.getOnchainFee({address})
    expect(fee).toBeGreaterThan(0)
  }
  
  {
    const address = await userWallet3.getOnChainAddress()
    const fee = await userWallet0.getOnchainFee({address})
    expect(fee).toBe(0)
  }
  
})

it('Sends onchain payment successfully', async () => {
  const { address } = await lnService.createChainAddress({ format: 'p2wpkh', lnd: lndOutside1 })

  const sub = lnService.subscribeToTransactions({ lnd: lndMain })
  sub.on('chain_transaction', onchainTransactionEventHandler)

  {
    const results = await Promise.all([
      once(sub, 'chain_transaction'),
      userWallet0.onChainPay({ address, amount }),
    ])

    expect(results[1]).toBeTruthy()
    await onchainTransactionEventHandler(results[0][0])
  }

  // we don't send a notification for send transaction for now
  // expect(sendNotification.mock.calls.length).toBe(1)
  // expect(sendNotification.mock.calls[0][0].data.type).toBe("onchain_payment")
  // expect(sendNotification.mock.calls[0][0].data.title).toBe(`Your transaction has been sent. It may takes some time before it is confirmed`)

  // FIXME: does this syntax always take the first match item in the array? (which is waht we want, items are return as newest first)
  const { results: [pendingTxn] } = await MainBook.ledger({ account: userWallet0.accountPath, pending: true })

	const {BTC: interimBalance} = await userWallet0.getBalances()
	expect(interimBalance).toBe(initialBalanceUser0 - amount - pendingTxn.fee)
  await checkIsBalanced()
  
  const txs = await userWallet0.getTransactions()
  const pendingTxs = filter(txs, {pending: true})
  expect(pendingTxs.length).toBe(1)
  expect(pendingTxs[0].amount).toBe(-amount - pendingTxs[0].fee)

  // const subSpend = lnService.subscribeToChainSpend({ lnd: lndMain, bech32_address: address, min_height: 1 })

  {
    await Promise.all([
      once(sub, 'chain_transaction'),
      waitUntilBlockHeight({ lnd: lndMain, blockHeight: initBlockCount + 6 }),
      bitcoindDefaultClient.generateToAddress(6, RANDOM_ADDRESS),
    ])
  }

  await sleep(1000)
  console.log(JSON.stringify(sendNotification.mock.calls))

  // expect(sendNotification.mock.calls.length).toBe(2)  // FIXME: should be 1
  expect(sendNotification.mock.calls[0][0].title).toBe(`Your on-chain transaction has been confirmed`)
  expect(sendNotification.mock.calls[0][0].data.type).toBe("onchain_payment")

  const { results: [{ pending, fee, feeUsd }] } = await MainBook.ledger({ account: userWallet0.accountPath, hash: pendingTxn.hash })

	expect(pending).toBe(false)
	expect(fee).toBeGreaterThan(0)
	expect(feeUsd).toBeGreaterThan(0)

	const [txn] = (await userWallet0.getTransactions()).filter(tx => tx.hash === pendingTxn.hash)
	expect(txn.amount).toBe(- amount - fee)
	expect(txn.type).toBe('onchain_payment')

	const {BTC: finalBalance} = await userWallet0.getBalances()
	expect(finalBalance).toBe(initialBalanceUser0 - amount - fee)
})

it('makes onchain on-us transaction', async () => {
  const user3Address = await userWallet3.getOnChainAddress()
  const {BTC: initialBalanceUser3} = await userWallet3.getBalances()

  const paymentResult = await userWallet0.onChainPay({ address: user3Address as string, amount })

  const {BTC: finalBalanceUser0} = await userWallet0.getBalances()
  const {BTC: finalBalanceUser3} = await userWallet3.getBalances()

  expect(paymentResult).toBe(true)
  expect(finalBalanceUser0).toBe(initialBalanceUser0 - amount)
  expect(finalBalanceUser3).toBe(initialBalanceUser3 + amount)

  const { results: [{ pending, fee, feeUsd }] } = await MainBook.ledger({ account: userWallet0.accountPath, type: "onchain_on_us" })
  expect(pending).toBe(false)
	expect(fee).toBe(0)
	expect(feeUsd).toBe(0)

  await checkIsBalanced()
})

it('Sends onchain payment _with memo', async () => {
  const memo = "this is my onchain memo"
  const { address } = await lnService.createChainAddress({ format: 'p2wpkh', lnd: lndOutside1 })
  const paymentResult = await userWallet0.onChainPay({ address, amount, memo })
  expect(paymentResult).toBe(true)
  const txs = await userWallet0.getTransactions()
  expect((first(txs) as any).description).toBe(memo)
})

it('makes onchain on-us transaction with memo', async () => {
  const memo = "this is my onchain memo"
  const user3Address = await userWallet3.getOnChainAddress()
  const paymentResult = await userWallet0.onChainPay({ address: user3Address as string, amount, memo })
  expect(paymentResult).toBe(true)
  
  const txs = await userWallet0.getTransactions()
  expect((first(txs) as any).description).toBe(memo)
  
  // receiver should not know memo from sender
  const txsUser3 = await userWallet3.getTransactions()
  expect((first(txsUser3) as any).description).not.toBe(memo)
})

it('fails to make onchain payment to self', async () => {
  const address = await userWallet0.getOnChainAddress()
  await expect(userWallet0.onChainPay({ address, amount })).rejects.toThrow()
})

it('fails to make on-us onchain payment when insufficient balance', async () => {
  const address = await userWallet3.getOnChainAddress()
  await expect(userWallet0.onChainPay({ address, amount: initialBalanceUser0 + 1 })).rejects.toThrow()
})

it('fails to make onchain payment when insufficient balance', async () => {
  const { address } = await lnService.createChainAddress({
    lnd: lndOutside1,
    format: 'p2wpkh',
  })
  const {BTC: initialBalanceUser3} = await userWallet3.getBalances();

  //should fail because user does not have balance to pay for on-chain fee
  await expect(userWallet3.onChainPay({ address: address as string, amount: initialBalanceUser3 })).rejects.toThrow()
})
