import { PrismaClient, Role, AuctionStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting BidWave database seeding...');

  // Clean existing records
  await prisma.bid.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create Seller
  const seller = await prisma.user.create({
    data: {
      email: 'seller@bidwave.com',
      passwordHash,
      role: Role.SELLER,
      emailVerified: true,
    },
  });

  // 2. Create Bidders
  const bidder1 = await prisma.user.create({
    data: {
      email: 'bidder1@bidwave.com',
      passwordHash,
      role: Role.BIDDER,
      emailVerified: true,
    },
  });

  const bidder2 = await prisma.user.create({
    data: {
      email: 'bidder2@bidwave.com',
      passwordHash,
      role: Role.BIDDER,
      emailVerified: true,
    },
  });

  const bidder3 = await prisma.user.create({
    data: {
      email: 'bidder3@bidwave.com',
      passwordHash,
      role: Role.BIDDER,
      emailVerified: true,
    },
  });

  // 3. Create Admin
  await prisma.user.create({
    data: {
      email: 'admin@bidwave.com',
      passwordHash,
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  console.log('✅ Seeded Users:');
  console.log('   - Seller: seller@bidwave.com (Password123!)');
  console.log('   - Bidder 1: bidder1@bidwave.com (Password123!)');
  console.log('   - Bidder 2: bidder2@bidwave.com (Password123!)');
  console.log('   - Bidder 3: bidder3@bidwave.com (Password123!)');
  console.log('   - Admin: admin@bidwave.com (Password123!)');

  // 4. Create Active Live Auction (Ends in 10 minutes)
  const now = new Date();
  const liveAuction1 = await prisma.auction.create({
    data: {
      sellerId: seller.id,
      title: 'Vintage 1978 Roland Jupiter-4 Analog Synthesizer',
      description: 'Fully serviced and calibrated vintage synthesizer with original flight case and manual. Rare collectible in museum condition.',
      images: [
        'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80'
      ],
      startingPrice: 1200.00,
      reservePrice: 2000.00,
      minIncrement: 50.00,
      status: AuctionStatus.OPEN,
      antiSnipeWindowSeconds: 30,
      antiSnipeExtensionSeconds: 60,
      startsAt: new Date(now.getTime() - 1000 * 60 * 30), // started 30 mins ago
      endsAt: new Date(now.getTime() + 1000 * 60 * 10),  // ends in 10 mins
      version: 2,
    },
  });

  // Add initial bids to liveAuction1
  const bid1 = await prisma.bid.create({
    data: {
      auctionId: liveAuction1.id,
      bidderId: bidder1.id,
      amount: 1250.00,
      createdAt: new Date(now.getTime() - 1000 * 60 * 20),
    },
  });

  const bid2 = await prisma.bid.create({
    data: {
      auctionId: liveAuction1.id,
      bidderId: bidder2.id,
      amount: 1400.00,
      createdAt: new Date(now.getTime() - 1000 * 60 * 5),
    },
  });

  await prisma.auction.update({
    where: { id: liveAuction1.id },
    data: { currentHighestBidId: bid2.id },
  });

  // 5. Create Second Live Auction (Ends in 2 hours)
  const liveAuction2 = await prisma.auction.create({
    data: {
      sellerId: seller.id,
      title: '1968 Omega Speedmaster Professional "Moonwatch"',
      description: 'Calibre 321 mechanical chronograph. Authentic stepped dial with pristine tritium patina. Authenticity papers included.',
      images: [
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80'
      ],
      startingPrice: 3500.00,
      reservePrice: 5000.00,
      minIncrement: 100.00,
      status: AuctionStatus.OPEN,
      antiSnipeWindowSeconds: 45,
      antiSnipeExtensionSeconds: 90,
      startsAt: new Date(now.getTime() - 1000 * 60 * 15),
      endsAt: new Date(now.getTime() + 1000 * 60 * 120),
      version: 1,
    },
  });

  const speedmasterBid = await prisma.bid.create({
    data: {
      auctionId: liveAuction2.id,
      bidderId: bidder3.id,
      amount: 3600.00,
      createdAt: new Date(now.getTime() - 1000 * 60 * 10),
    },
  });

  await prisma.auction.update({
    where: { id: liveAuction2.id },
    data: { currentHighestBidId: speedmasterBid.id },
  });

  // 6. Create Draft Auction
  await prisma.auction.create({
    data: {
      sellerId: seller.id,
      title: 'Leica M6 Classic 35mm Rangefinder Camera (Black)',
      description: 'Mint condition 0.72x viewfinder with Summicron 50mm f/2 lens.',
      images: [
        'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80'
      ],
      startingPrice: 2800.00,
      reservePrice: 3200.00,
      minIncrement: 50.00,
      status: AuctionStatus.DRAFT,
      antiSnipeWindowSeconds: 30,
      antiSnipeExtensionSeconds: 60,
      startsAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
      endsAt: new Date(now.getTime() + 1000 * 60 * 60 * 48),
      version: 0,
    },
  });

  console.log('✅ Seeded Sample Auctions & Bids successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
