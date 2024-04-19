import { ClientTransactionResponse } from '../../types';

export interface IEscrow {
  approve(
    serviceId: string,
    proposalId: string,
    metaEvidenceCid: string,
    platformId?: number
  ): Promise<ClientTransactionResponse>;
  release(serviceId: string, amount: bigint, userId: number, platformId?: number): Promise<any>;
  reimburse(serviceId: string, amount: bigint, userId: number, platformId?: number): Promise<any>;
  getProtocolAndPlatformsFees(
    originServicePlatformId: string,
    originValidatedProposalPlatformId: string,
  ): Promise<any>;
  getByService(serviceId: string, paymentType?: string): Promise<any>;
}
