/*
  Document:
  1. Subscription API（後端）: https://github.com/readr-media/readr-restful/wiki/Subscription
  2. TapPay SDK（付款）: https://docs.tappaysdk.com/tutorial/zh/home.html
  3. ezPay API（發票）: https://inv.ezpay.com.tw/dw_files/info_api/ezPay_EZP_INVI_1_1_9.pdf
*/

const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const corsMiddle = require('../corsMiddle')
const isEmail = require('validator/lib/isEmail')

const { API_PROTOCOL, API_HOST, API_PORT } = require('../../config')
const { decamelizeKeys } = require('humps')
const { default: isMobilePhone } = require('validator/lib/isMobilePhone')
const { get } = require('lodash')
const { handlerError, } = require('../../comm')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

const PAYMENT_SERVICE = 'tappay'
const INVOICE_SERVICE = 'ezpay'
const CURRENCY = 'TWD'
const ITEM_NAME = '訂閱'
const ITEM_UNIT = '月'
const ITEM_COUNT = 1

const validate = (req, res, next) => {
    const body = req.body
    const cardholderPhoneNumber = get(body, 'paymentInfos.cardholder.phoneNumber', '')
    const cardholderName = get(body, 'paymentInfos.cardholder.name')
    const cardholderEmail = get(body, 'paymentInfos.cardholder.email', '')
    const prime = get(body, 'paymentInfos.prime')
    const invoiceInfos = get(body, 'invoiceInfos')
    const validated = isMobilePhone(cardholderPhoneNumber) && cardholderName && isEmail(cardholderEmail) && prime && invoiceInfos
    
    if (!validated) {
      console.error(`[Error] POST/subscriptions`, 'req.body:', req.body)
      return res.status(403).end('Invalid request body.')
    }
    next()
}

const setCommonValue = (req, res, next) => {
  let body = req.body
  body.createdAt = body.createdAt || new Date().toISOString()
  body.paymentService = PAYMENT_SERVICE
  body.invoiceService = INVOICE_SERVICE
  body.paymentInfos.currency = CURRENCY
  body.paymentInfos.details = `READr subscription at ${body.createdAt}`
  body.invoiceInfos.itemName = [ ITEM_NAME ]
  body.invoiceInfos.itemUnit = [ ITEM_UNIT ]
  body.invoiceInfos.itemCount = [ ITEM_COUNT ]
  body.invoiceInfos.printFlag = 'N'
  
  // Rule by ezPay
  if (body.invoiceInfos.category === 'B2B') {
    body.invoiceInfos.printFlag = 'Y'
  }
  if (!body.invoiceInfos.carrierType && !body.invoiceInfos.loceCode) {
    body.invoiceInfos.printFlag = 'Y'
  }
  next()
}

// For CORS non-simple requests
router.options('/*', corsMiddle, res => {
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With')
  res.send(200)
})

router.post('/', validate, setCommonValue, (req, res, next) => {
  const url = `${apiHost}/subscriptions`
  const bodyDecamelized = decamelizeKeys(req.body)
  superagent
    .post(url)
    .send(bodyDecamelized)
    .end((error, response) => {
      if (!error && response) {
        res.send('Subscribe READr successfully.')
        console.info(`Subscriptions successfully. Paid by ${req.body.paymentInfos.cardholder.email} credit card: *-*-*-${req.body.invoiceInfos.lastFourNum}.`)
      } else {
        console.error('[Error] POST/subscriptions', 'req.body:', bodyDecamelized, error)
        const errorWrapper = handlerError(error, response)
        return res.status(errorWrapper.status).json(errorWrapper.text)      
      }
    })
})

module.exports = router
