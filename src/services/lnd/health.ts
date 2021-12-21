import { getWalletStatus } from "lightning"
import { baseLogger } from "@services/logger"

import { params as unauthParams } from "./unauth"
import { params as authParams } from "./auth"

/*

	Check the status of the wallet and emit current state

*/

/* eslint-disable @typescript-eslint/no-var-requires */
const EventEmitter = require("events")

const refresh_time = 10000 // ms

const isUpLoop = (param) =>
  setInterval(async () => {
    await isUp(param)
  }, refresh_time)

export const isUp = async (param): Promise<void> => {
  let active = false
  const { lnd, socket, active: isParamActive } = param

  try {
    // will throw if there is an error
    // TODO: add is_ready validation when lnd is updated above 0.13.4 https://github.com/alexbosworth/ln-service#getwalletstatus
    const { is_active } = await getWalletStatus({ lnd })
    active = !!is_active
  } catch (err) {
    baseLogger.warn({ err }, `can't get wallet info from ${socket}`)
    active = false
  }

  const authParam = authParams.find((p) => p.socket === socket)
  if (authParam) {
    authParam.active = active
  }
  param.active = active

  if (active && !isParamActive) {
    lndStatusEvent.emit("started", authParam || param)
  }

  if (!active && isParamActive) {
    lndStatusEvent.emit("stopped", authParam || param)
  }

  baseLogger.debug({ socket, active }, "lnd pulse")
}

// launching a loop to update whether lnd are active or not
export const activateLndHealthCheck = () => unauthParams.forEach(isUpLoop)

class LndStatusEventEmitter extends EventEmitter {}
export const lndStatusEvent = new LndStatusEventEmitter()
