import { Hash, parseEther, zeroAddress } from 'viem';
import { getChainConfig } from '../config';
import { FEE_RATE_DIVIDER } from '../constants';
import GraphQLClient from '../graphql';
import IPFSClient from '../ipfs';
import { Logger } from '../logger';
import { ClientTransactionResponse, Config, CustomConfig, NetworkEnum, TransactionHash } from '../types';
import { ViemClient } from '../viem';
import { getPlatformById, getPlatformsByOwner } from './graphql/queries';
import { Arbitrator, PlatformDetails } from './types';

export class Platform {
  /** @hidden */
  subgraph: GraphQLClient;
  /** @hidden */
  wallet: ViemClient;
  /** @hidden */
  platformID: number;
  /** @hidden */
  ipfs: IPFSClient;
  /** @hidden */
  customConfig?: CustomConfig;
  /** @hidden */
  logger: Logger

  /** @hidden */
  static readonly UPDATE_ERROR = 'unable to update platform details';

  /** @hidden */
  constructor(
    graphQlClient: GraphQLClient,
    walletClient: ViemClient,
    platformId: number,
    ipfsClient: IPFSClient,
    logger: Logger,
    customConfig?: CustomConfig
  ) {
    logger.info('Initialising platform');
    this.logger = logger
    this.subgraph = graphQlClient;
    this.wallet = walletClient;
    this.platformID = platformId;
    this.ipfs = ipfsClient;
    this.customConfig = customConfig;
  }

  /**
 * Retrieves the details of a specific platform based on the provided ID.
 * This method queries the GraphQL client for the platform data and returns the platform details if found.
 *
 * @param {string} id - The unique identifier of the platform to retrieve.
 * @returns {Promise<any>} A promise that resolves to the platform details if found, otherwise null.
 */
  public async getOne(id: string): Promise<any> {
    const response = await this.subgraph.get(getPlatformById(id));

    if (response?.data?.platform) {
      return response?.data?.platform;
    }

    return null;
  }

  /**
 * Uploads platform details to IPFS and returns the corresponding CID.
 *
 * @param {PlatformDetails} data - The platform details to be uploaded.
 * @returns {Promise<string>} A promise that resolves to the CID of the uploaded data.
 */
  public async upload(data: PlatformDetails): Promise<string> {
    return this.ipfs.post(JSON.stringify(data));
  }

  /**
 * Fetches platforms owned by a specific address.
 *
 * @param {string} address - The wallet address of the platform owner.
 * @returns {Promise<any>} A promise that resolves to an array of platforms owned by the address, or an empty array if none.
 */
  public async getByOwner(address: `0x${string}`): Promise<any> {
    const response = await this.subgraph.get(getPlatformsByOwner(address));

    if (response?.data?.platforms) {
      return response?.data?.platforms;
    }

    return [];
  }

  /**
 * Updates the platform details on the blockchain using the provided data.
 *
 * @param {PlatformDetails} data - The new platform details to be updated.
 * @param {number} platformId - The platform ID where the platform details are updated. (optional)
 * @returns {Promise<ClientTransactionResponse>} A promise that resolves to the transaction response of the update operation.
 */
  public async update(data: PlatformDetails, platformId?: number): Promise<ClientTransactionResponse> {
    const platformID = platformId || this.platformID;
    this.logger.debug('updating platform details');
    const cid = await this.upload(data);
    this.logger.debug('platform details uploaded to ipfs', cid);
    const tx = await this.wallet.writeContract('talentLayerPlatformId', 'updateProfileData', [
      platformID,
      cid,
    ]);

    if (!cid || !tx) {
      throw new Error(Platform.UPDATE_ERROR);
    }

    return { cid, tx };
  }

  /**
   * Mints a platform Id.
   *
   * @param {string} platformName - The name of the platform.
   * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the create operation.
   */
  public async mint(platformName: string): Promise<Hash> {
    const tx = await this.wallet.writeContract(
      'talentLayerPlatformId',
      'mint',
      [platformName],
    );

    return tx;
  }

  /**
   * Mints a platform Id for a address.
   *
   * @param {string} platformName - The name of the platform.
   * @param {string} address - The address of the user.
   * @param {string} mintFee - The Fee for the minting of platform Id.
   * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the create operation.
   */
  public async mintForAddress(platformName: string, address: string, mintFee: any): Promise<Hash> {
    const tx = await this.wallet.writeContract(
      'talentLayerPlatformId',
      'mintForAddress',
      [platformName, address],
      mintFee as bigint
    );
    return tx;
  }

  /**
 * Sets the fee timeout for the platform.
 * 
 * @param {number} timeout - The timeout value in seconds.
 * @param {number} platformId - The platform ID where the fee timeout is set. (optional)
 * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the update operation.
 */
  public async setFeeTimeout(timeout: number, platformId?: number): Promise<Hash> {
    const platformID = platformId || this.platformID;
    const tx = await this.wallet.writeContract(
      'talentLayerPlatformId',
      'updateArbitrationFeeTimeout',
      [platformID, timeout],
    );

    return tx;
  }

  /**
 * Retrieves a list of available arbitrators for a given chain ID.
 * 
 * @param {NetworkEnum} chainId - The blockchain network chain ID.
 * @returns {Arbitrator[]} An array of arbitrator objects available for the specified chain.
 */
  public getArbitrators(chainId: NetworkEnum): Arbitrator[] {
    const chainConfig: Config = this.customConfig ? this.customConfig.contractConfig : getChainConfig(chainId);
    const contract = chainConfig.contracts['talentLayerArbitrator'];
    const allowedArbitrators = [
      { address: zeroAddress, name: 'None' },
      { address: contract.address, name: 'TalentLayer Arbitrator' },
    ];

    return allowedArbitrators;
  }

  /**
 * Updates the arbitrator address for the platform.
 * Throws an error if the provided address is not an allowed arbitrator.
 * 
 * @param {Hash} address - The new arbitrator's address.
 * @param {number} platformId - The platform ID where the arbitrator address is updated. (optional)
 * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the update operation.
 */
  public async updateArbitrator(address: Hash, platformId?: number): Promise<Hash> {
    const platformID = platformId || this.platformID;
    const allowedArbitrators: Arbitrator[] = this.getArbitrators(this.wallet.chainId);

    const allowedArbitratorAddresses = allowedArbitrators.map((_arbitrator: Arbitrator) =>
      _arbitrator.address.toLowerCase(),
    );

    if (!allowedArbitratorAddresses.includes(address.toLowerCase())) {
      throw new Error(`Invalid Arbitrator: ${address}`);
    }

    const tx = await this.wallet.writeContract('talentLayerPlatformId', 'updateArbitrator', [
      platformID,
      address,
      '',
    ]);

    return tx;
  }

  // Fee functions

  /**
 * Updates the service fee rate for origin services on the platform.
 * 
 * @param {number} value - The new fee rate as a percentage ( if you want to set the fees to 5%, pass in 5).
 * @param {number} platformId - The platform ID where the service fee rate is updated. (optional)
 * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the update operation.
 */
  public async updateOriginServiceFeeRate(value: number, platformId?: number): Promise<Hash> {
    const platformID = platformId || this.platformID;
    const transformedFeeRate = Math.round((Number(value) * FEE_RATE_DIVIDER) / 100);

    this.logger.info(`updating service fee rate for platform id: ${platformID} to ${transformedFeeRate}`);
    const tx = await this.wallet.writeContract(
      'talentLayerPlatformId',
      'updateOriginServiceFeeRate',
      [platformID, transformedFeeRate],
    );

    return tx;
  }

  /**
 * Updates the fee rate for validated proposals
 * 
 * @param {number} value - The new fee rate as a percentage ( if you want to set the fees to 5%, pass in 5).
 * @param {number} platformId - The platform ID where fee rate is updated. (optional)
 * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the update operation.
 */
  public async updateOriginValidatedProposalFeeRate(value: number, platformId?: number): Promise<Hash> {
    const platformID = platformId || this.platformID;
    const transformedFeeRate = Math.round((Number(value) * FEE_RATE_DIVIDER) / 100);

    this.logger.debug('SDK: transformedFeeRate', transformedFeeRate, platformID);
    const tx = await this.wallet.writeContract(
      'talentLayerPlatformId',
      'updateOriginValidatedProposalFeeRate',
      [platformID, transformedFeeRate],
    );

    return tx;
  }

  /**
 * Updates the posting fee for services on the platform.
 * 
 * @param {number} value - The new fee rate.
 * @param {number} platformId - The platform ID where the posting fee is updated. (optional)
 * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the update operation.
 */
  public async updateServicePostingFee(value: number, platformId?: number): Promise<Hash> {
    const platformID = platformId || this.platformID;
    const transformedFeeRate = parseEther(value.toString());
    this.logger.debug(`updating service posting fee rate for platform id: ${platformID} to ${transformedFeeRate}`);
    const tx = await this.wallet.writeContract('talentLayerPlatformId', 'updateServicePostingFee', [
      platformID,
      transformedFeeRate,
    ]);

    return tx;
  }

  /**
 * Updates the posting fee for proposals on the platform.
 * 
 * @param {number} value - The new fee rate.
 * @param {number} platformId - The platform ID where the posting fee is updated. (optional)
 * @returns {Promise<Hash>} A promise that resolves to the transaction hash of the update operation.
 */
  public async updateProposalPostingFee(value: number, platformId?: number): Promise<Hash> {
    const platformID = platformId || this.platformID;
    const transformedFeeRate = parseEther(value.toString());
    this.logger.debug(`updating proposal posting fee rate for platform id: ${platformID} to ${transformedFeeRate}`);

    const tx = await this.wallet.writeContract(
      'talentLayerPlatformId',
      'updateProposalPostingFee',
      [platformID, transformedFeeRate],
    );

    return tx;
  }
}
