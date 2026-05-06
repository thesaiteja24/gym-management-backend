import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient().$extends(withAccelerate())

export class RevenueCatService {
  static async processEvent(event: any) {
    const { id, type, app_user_id, event_timestamp_ms, expiration_at_ms, product_id } = event
    if (!id || !app_user_id || !type) {
      return
    }

    await prisma.$transaction(async (tx: any) => {
      const existing = await tx.revenueCatEvent.findUnique({ where: { id } })
      if (existing) return

      const user = await tx.user.findUnique({ where: { id: app_user_id } })
      if (!user) {
        return tx.revenueCatEvent.create({
          data: {
            id,
            type,
            appUserId: app_user_id,
            eventTimestamp: new Date(Number(event_timestamp_ms)),
          },
        })
      }

      const { isPro, proExpirationDate, proSubscriptionType } = this.calculateProStatus(
        type,
        user,
        expiration_at_ms,
        product_id,
      )

      await tx.user.update({
        where: { id: app_user_id },
        data: {
          isPro,
          proExpirationDate,
          proSubscriptionType,
          proSubscriptionId: event.original_transaction_id || user.proSubscriptionId,
        },
      })

      await tx.revenueCatEvent.create({
        data: {
          id,
          type,
          appUserId: app_user_id,
          eventTimestamp: new Date(Number(event_timestamp_ms)),
        },
      })
    })
  }

  private static calculateProStatus(
    type: string,
    user: any,
    expiration_at_ms: string | null,
    product_id: string,
  ) {
    let isPro = user.isPro
    let proExpirationDate = user.proExpirationDate
    const now = new Date()
    const expDate = expiration_at_ms ? new Date(Number(expiration_at_ms)) : null
    const subType = product_id.toLowerCase().includes('year')
      ? 'yearly'
      : product_id.toLowerCase().includes('month')
        ? 'monthly'
        : 'lifetime'

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'NON_RENEWING_PURCHASE':
      case 'UNCANCELLATION':
        if (!expDate || expDate > now) {
          isPro = true
          proExpirationDate = expDate
        }
        break
      case 'CANCELLATION':
      case 'EXPIRATION':
      case 'BILLING_ISSUE':
        if (expDate && expDate <= now) isPro = false
        else if (!expDate) isPro = false
        if (expDate) proExpirationDate = expDate
        break
    }
    return {
      isPro,
      proExpirationDate,
      proSubscriptionType: isPro ? subType : user.proSubscriptionType,
    }
  }
}
