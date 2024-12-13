import {checkSrcConnection} from '../src/docker';

describe('checkSrcConnection', () => {
  it('should fail with no creds', async () => {
    await expect(
      checkSrcConnection(`${process.cwd()}/test/resources`, 'farosai/airbyte-faros-graphql-source'),
    ).rejects.toThrow('Invalid Authorization header');
  });
});
