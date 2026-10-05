import { Resend } from 'resend';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class EmailService {
  private resend: Resend | null = null;

  constructor() {
    if (env.RESEND_API_KEY && env.RESEND_API_KEY.startsWith('re_')) {
      this.resend = new Resend(env.RESEND_API_KEY);
    }
  }

  async sendOutbidNotification(to: string, auctionTitle: string, newHighestBid: number) {
    const subject = `You've been outbid on "${auctionTitle}"`;
    const text = `Someone placed a higher bid of $${newHighestBid.toFixed(2)} on "${auctionTitle}". Bid again now to stay in the race!`;

    return this.sendEmail(to, subject, text);
  }

  async sendAuctionWonNotification(to: string, auctionTitle: string, finalAmount: number) {
    const subject = `Congratulations! You won the auction: "${auctionTitle}"`;
    const text = `You won "${auctionTitle}" with a winning bid of $${finalAmount.toFixed(2)}!`;

    return this.sendEmail(to, subject, text);
  }

  async sendAuctionSoldNotification(to: string, auctionTitle: string, finalAmount: number) {
    const subject = `Your listing "${auctionTitle}" has been sold!`;
    const text = `Your auction for "${auctionTitle}" ended successfully at $${finalAmount.toFixed(2)}.`;

    return this.sendEmail(to, subject, text);
  }

  private async sendEmail(to: string, subject: string, text: string) {
    if (!this.resend) {
      logger.info({ to, subject, text }, 'Mock email sent (RESEND_API_KEY not configured)');
      return;
    }

    try {
      await this.resend.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject,
        text,
      });
      logger.info({ to, subject }, 'Email sent successfully via Resend');
    } catch (err) {
      logger.error({ err, to, subject }, 'Failed to send email via Resend');
    }
  }
}

export const emailService = new EmailService();
