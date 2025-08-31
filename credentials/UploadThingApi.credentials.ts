import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class UploadThingApi implements ICredentialType {
	name = 'uploadThingApi';
	displayName = 'UploadThing API';
	documentationUrl = 'https://docs.uploadthing.com';
	properties: INodeProperties[] = [
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			default: '',
			description: 'UploadThing token from dashboard',
			typeOptions: {
				password: true,
			},
		},
	];
}


