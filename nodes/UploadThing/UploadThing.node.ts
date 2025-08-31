import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
	IExecuteFunctions,
} from 'n8n-workflow';
import { UTApi, UTFile } from 'uploadthing/server';

export class UploadThing implements INodeType {
	description: INodeTypeDescription = {
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'File',
						value: 'file',
					},
				],
				default: 'file',
				noDataExpression: true,
				required: true,
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['file'],
					},
				},
				options: [
					{
						name: 'Upload Binary',
						value: 'uploadBinary',
						action: 'Upload binary',
						description: 'Upload binary data from input',
					},
					{
						name: 'Upload From URL',
						value: 'uploadFromUrl',
						action: 'Upload from URL',
						description: 'Upload file from URL(s)',
					},
				],
				default: 'uploadBinary',
				noDataExpression: true,
			},
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				required: true,
				default: 'data',
				description: 'Name of input binary property',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadBinary'],
					},
				},
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				description: 'Override the file name',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadBinary'],
					},
				},
			},
			{
				displayName: 'Custom ID',
				name: 'customId',
				type: 'string',
				default: '',
				description: 'Bind a custom identifier to the file',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadBinary', 'uploadFromUrl'],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Override the filename for URL upload',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadFromUrl'],
					},
				},
			},
			{
				displayName: 'URL(s)',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				description: 'Single URL or comma-separated list',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadFromUrl'],
					},
				},
			},
			{
				displayName: 'Content Disposition',
				name: 'contentDisposition',
				type: 'options',
				options: [
					{ name: 'Inline', value: 'inline' },
					{ name: 'Attachment', value: 'attachment' },
				],
				default: 'inline',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadBinary', 'uploadFromUrl'],
					},
				},
			},
			{
				displayName: 'ACL',
				name: 'acl',
				type: 'options',
				options: [
					{ name: 'Public Read', value: 'public-read' },
					{ name: 'Private', value: 'private' },
				],
				default: 'public-read',
				description: 'Access control setting',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadBinary', 'uploadFromUrl'],
					},
				},
			},
			{
				displayName: 'Metadata',
				name: 'metadata',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadBinary', 'uploadFromUrl'],
					},
				},
			},
			{
				displayName: 'Concurrency',
				name: 'concurrency',
				type: 'number',
				default: 1,
				typeOptions: {
					minValue: 1,
					maxValue: 25,
				},
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['uploadBinary', 'uploadFromUrl'],
					},
				},
			},
		],
		displayName: 'UploadThing',
		name: 'uploadThing',
		icon: 'file:uploadThing.svg',
		group: ['transform'],
		version: 1,
		description: 'Upload files to UploadThing',
		defaults: {
			name: 'UploadThing',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'uploadThingApi',
				required: true,
			},
		],
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const credentials = (await this.getCredentials('uploadThingApi')) as IDataObject;
		const token = String(credentials.token || '');
		const utapi = new UTApi({ token });
		const returnItems: INodeExecutionData[] = [];
		if (operation === 'uploadBinary') {
			for (let i = 0; i < items.length; i++) {
				try {
					const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
					const customId = this.getNodeParameter('customId', i, '') as string;
					const fileNameOverride = this.getNodeParameter('fileName', i, '') as string;
					const contentDisposition = this.getNodeParameter('contentDisposition', i) as string;
					const acl = this.getNodeParameter('acl', i, '') as string;
					const metadata = (this.getNodeParameter('metadata', i, {}) as IDataObject) || {};
					const concurrency = this.getNodeParameter('concurrency', i, 1) as number;
					const binary = items[i].binary?.[binaryProperty];
					if (!binary) {
						throw new NodeOperationError(
							this.getNode(),
							`Binary property not found: ${binaryProperty}`,
						);
					}
					const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);
					const fileName = fileNameOverride || binary.fileName || 'file';
					const mimeType = binary.mimeType || 'application/octet-stream';
					const file = new UTFile([buffer], fileName, {
						type: mimeType,
						customId: customId || undefined,
					} as any);
					const opts: Record<string, unknown> = { metadata };
					if (contentDisposition) opts['contentDisposition'] = contentDisposition;
					if (acl) opts['acl'] = acl;
					if (concurrency) opts['concurrency'] = concurrency;
					const res = await utapi.uploadFiles([file] as any, opts as any);
					const list = Array.isArray(res) ? res : [res as any];
					for (const r of list as any[]) {
						const data = r && 'data' in r && r.data ? r.data : r;
						returnItems.push({ json: data as IDataObject });
					}
				} catch (error) {
					if (this.continueOnFail()) {
						returnItems.push({ json: { error: (error as Error).message } });
						continue;
					}
					throw error;
				}
			}
		} else if (operation === 'uploadFromUrl') {
			for (let i = 0; i < items.length; i++) {
				try {
					const urlRaw = this.getNodeParameter('url', i) as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const customId = this.getNodeParameter('customId', i, '') as string;
					const contentDisposition = this.getNodeParameter('contentDisposition', i) as string;
					const acl = this.getNodeParameter('acl', i, '') as string;
					const metadata = (this.getNodeParameter('metadata', i, {}) as IDataObject) || {};
					const concurrency = this.getNodeParameter('concurrency', i, 1) as number;
					const urls = urlRaw
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean);
					let input: any;
					if (urls.length === 1) {
						if (name || customId) {
							input = { url: urls[0], name: name || undefined, customId: customId || undefined };
						} else {
							input = urls[0];
						}
					} else {
						input = urls;
					}
					const opts: Record<string, unknown> = { metadata };
					if (contentDisposition) opts['contentDisposition'] = contentDisposition;
					if (acl) opts['acl'] = acl;
					if (concurrency) opts['concurrency'] = concurrency;
					const res = await utapi.uploadFilesFromUrl(input as any, opts as any);
					const list = Array.isArray(res) ? res : [res as any];
					for (const r of list as any[]) {
						const data = r && 'data' in r && r.data ? r.data : r;
						returnItems.push({ json: data as IDataObject });
					}
				} catch (error) {
					if (this.continueOnFail()) {
						returnItems.push({ json: { error: (error as Error).message } });
						continue;
					}
					throw error;
				}
			}
		}
		return [returnItems];
	}
}
