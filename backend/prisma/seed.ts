import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Create a loan
  const loan = await prisma.loan.create({
    data: {
      borrowerId: 'user_001',
      amount: 10000,
      interestRate: 12, // 12% annual
      tenor: 12,
      status: 'APPROVED',
    },
  });

  console.log('Loan created:', loan.id);

  // 2. Create a disbursement
  const disbursement = await prisma.disbursement.create({
    data: {
      loanId: loan.id,
      amount: loan.amount,
      disbursementDate: new Date(),
      status: 'COMPLETED',
    },
  });

  console.log('Disbursement created:', disbursement.id);

  // 3. Create repayment schedule
  const monthlyRate = 0.12 / 12;
  const basePayment = (Number(loan.amount) * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -loan.tenor));

  const schedules = Array.from({ length: loan.tenor }).map((_, i) => ({
    loanId: loan.id,
    installmentNumber: i + 1,
    dueDate: new Date(new Date().setMonth(new Date().getMonth() + i)),
    principalAmount: Number((basePayment * 0.9).toFixed(2)), // example split
    interestAmount: Number((basePayment * 0.1).toFixed(2)),
    status: 'PENDING',
  }));

  await prisma.repaymentSchedule.createMany({ data: schedules });

  console.log('Repayment schedules created');

  // Optional: create a payment
  await prisma.payment.create({
    data: {
      loanId: loan.id,
      amount: 1000,
      paymentDate: new Date(),
      principalPaid: 900,
      interestPaid: 100,
      lateFeePaid: 0,
      daysLate: 0,
      status: 'PAID',
    },
  });

  console.log('Sample payment created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
