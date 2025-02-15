import { ERC20, IERC20 } from '../blockchain-bindings/erc20';
import GraphQLClient from '../graphql';
import IPFSClient from '../ipfs';
import { Logger } from '../logger';
import { Proposal } from '../proposals';
import { Service } from '../services';
import { ClientTransactionResponse, NetworkEnum, RateToken } from '../types';
import { calculateApprovalAmount } from '../utils/fees';
import { ViemClient } from '../viem';
import { getPaymentsByService, getProtocolAndPlatformsFees } from './graphql/queries';



/**
 * Release and reimburse payments using TalentLayer escrow
 *
 * @group TalentLayerClient Modules
 */
export class Escrow {

  /** @hidden */
  graphQlClient: GraphQLClient;
  /** @hidden */
  ipfsClient: IPFSClient;
  /** @hidden */
  viemClient: ViemClient;
  /** @hidden */
  platformID: number;
  /** @hidden */
  chainId: NetworkEnum;
  /** @hidden */
  erc20: IERC20;
  /** @hidden */
  logger: Logger;

  /** @hidden */
  constructor(
    graphQlClient: GraphQLClient,
    ipfsClient: IPFSClient,
    viemClient: ViemClient,
    platformId: number,
    chainId: NetworkEnum,
    logger: Logger
  ) {
    logger.info('Escrow initialising: ');
    this.graphQlClient = graphQlClient;
    this.logger = logger;
    this.platformID = platformId;
    this.ipfsClient = ipfsClient;
    this.viemClient = viemClient;
    this.chainId = chainId;
    this.erc20 = new ERC20(this.ipfsClient, this.viemClient, this.platformID, this.chainId, logger);
  }

  public async approve(
    serviceId: string,
    proposalId: string,
    metaEvidenceCid: string,
    platformId?: number
  ): Promise<ClientTransactionResponse> {
    const platformID = platformId || this.platformID;
    const proposalInstance = new Proposal(
      this.graphQlClient,
      this.ipfsClient,
      this.viemClient,
      platformID,
      this.logger
    );
    const proposal = await proposalInstance.getOne(proposalId);
    const erc20 = this.erc20;

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (!proposal.cid) {
      throw new Error('Proposal cid not found');
    }

    const sellerId: string = proposal.seller.id;

    let tx,
      cid = proposal.cid;

    const protocolAndPlatformsFees = await this.getProtocolAndPlatformsFees(
      proposal.service.platform.id, proposal.platform.id
    );

    this.logger.debug(`Fetched protocol and platform fees: ${protocolAndPlatformsFees}`);

    if (!protocolAndPlatformsFees) {
      throw Error('Unable to fetch fees');
    }

    const approvalAmount = calculateApprovalAmount(
      proposal.rateAmount,
      protocolAndPlatformsFees.servicePlatform.originServiceFeeRate,
      protocolAndPlatformsFees.proposalPlatform.originValidatedProposalFeeRate,
      protocolAndPlatformsFees.protocols[0].protocolEscrowFeeRate,
    );

    this.logger.debug(`Escrow seeking approval for amount: ${approvalAmount.toString()}`);

    if (proposal.rateToken.address === RateToken.NATIVE) {
      tx = await this.viemClient.writeContract(
        'talentLayerEscrow',
        'createTransaction',
        [parseInt(serviceId, 10), parseInt(sellerId, 10), metaEvidenceCid, cid],
        approvalAmount,
      );
    } else {
      this.logger.debug('Fetching allowance');
      // @ts-ignore
      const allowance: bigint = await erc20.checkAllowance(proposal.rateToken.address);

      this.logger.debug(`SDK: fetched allowance ${allowance}`);

      if (allowance < approvalAmount) {
        this.logger.debug('Approval amount less than allowance. Now requesting allowance');

        let approvalTransaction;
        try {
          approvalTransaction = await this.erc20.approve(
            proposal.rateToken.address,
            approvalAmount,
          );

          const approvalTransactionReceipt =
            await this.viemClient.publicClient.waitForTransactionReceipt({
              hash: approvalTransaction,
            });

          this.logger.debug('SDK: approvalTransactionReceipt', approvalTransactionReceipt);

          if (approvalTransactionReceipt.status !== 'success') {
            throw new Error('Unable to get approval');
          }
        } catch (e) {
          this.logger.error('Error occured while fetching approval', e);
          throw new Error('Approval transaction failed with error');
        }
      }

      tx = await this.viemClient.writeContract('talentLayerEscrow', 'createTransaction', [
        parseInt(serviceId, 10),
        parseInt(sellerId, 10),
        metaEvidenceCid,
        cid,
      ]);
    }

    if (tx) {
      return { tx, cid: proposal.cid };
    }

    throw new Error('Error creating Transaction');
  }

  public async release(serviceId: string, amount: bigint, userId: number, platformId?: number): Promise<any> {
    const platformID = platformId || this.platformID;
    const serviceInstance = new Service(
      this.graphQlClient,
      this.ipfsClient,
      this.viemClient,
      platformID,
      this.logger
    );
    const service = await serviceInstance.getOne(serviceId);
    const transactionId = service?.transaction?.id;

    if (!transactionId) {
      throw new Error('service transaction not found');
    }

    if (!transactionId) {
      throw new Error('Transaction Id not found for service');
    }

    const tx = await this.viemClient.writeContract('talentLayerEscrow', 'release', [
      userId,
      parseInt(transactionId),
      amount.toString(),
    ]);

    return tx;
  }

  public async reimburse(serviceId: string, amount: bigint, userId: number, platformId?: number): Promise<any> {
    const platformID = platformId || this.platformID;
    const serviceInstance = new Service(
      this.graphQlClient,
      this.ipfsClient,
      this.viemClient,
      platformID,
      this.logger
    );
    const service = await serviceInstance.getOne(serviceId);
    const transactionId = service?.transaction?.id;

    if (!transactionId) {
      throw new Error('service transaction not found');
    }

    if (!transactionId) {
      throw new Error('Transaction Id not found for service');
    }

    const tx = await this.viemClient.writeContract('talentLayerEscrow', 'reimburse', [
      userId,
      parseInt(transactionId),
      amount.toString(),
    ]);

    return tx;
  }

  public async getProtocolAndPlatformsFees(
    originServicePlatformId: string,
    originValidatedProposalPlatformId: string,
  ): Promise<any> {
    const query = getProtocolAndPlatformsFees(originServicePlatformId, originValidatedProposalPlatformId);

    const response = await this.graphQlClient.get(query);

    return response?.data || null;
  }

  public async getByService(serviceId: string, paymentType?: string): Promise<any> {
    const query = getPaymentsByService(serviceId, paymentType);

    const response = await this.graphQlClient.get(query);

    return response?.data?.payments || null
  }

}
