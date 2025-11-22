import { AuditContextService, AuditContext } from './audit-context.service';

describe('AuditContextService', () => {
  let service: AuditContextService;

  beforeEach(() => {
    service = new AuditContextService();
  });

  it('should store and return context using run()', async () => {
    const testContext: AuditContext = {
      transactionId: 'txn123',
      operation: 'TEST_OP',
      service: 'disbursement',
      userId: 'user123',
    };

    let receivedContext: AuditContext | undefined = undefined;

    await service.run(testContext, async () => {
      receivedContext = service.getContext();
    });

    expect(receivedContext).toEqual(testContext);
  });

  it('should isolate context between different runs', async () => {
    const ctxA: AuditContext = {
      transactionId: 'A',
      operation: 'OP_A',
      service: 'repayment',
    };

    const ctxB: AuditContext = {
      transactionId: 'B',
      operation: 'OP_B',
      service: 'disbursement',
    };

    let contextInA: AuditContext | undefined;
    let contextInB: AuditContext | undefined;

    await Promise.all([
      service.run(ctxA, async () => {
        contextInA = service.getContext();
      }),
      service.run(ctxB, async () => {
        contextInB = service.getContext();
      }),
    ]);

    expect(contextInA).toEqual(ctxA);
    expect(contextInB).toEqual(ctxB);
  });

  it('should return undefined outside run()', () => {
    expect(service.getContext()).toBeUndefined();
  });
});
