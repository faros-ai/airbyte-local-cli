import {checkSrcConnection} from '../src/docker';

describe('checkSrcConnection', () => {
  it('should success', async () => {
    await expect(
      checkSrcConnection(
        `${process.cwd()}/test/resources`,
        'farosai/airbyte-example-source',
        'faros_airbyte_cli_src_config_chris.json',
      ),
    ).resolves.not.toThrow();
  });

  it('should fail with', async () => {
    await expect(
      checkSrcConnection(
        `${process.cwd()}/test/resources`,
        'farosai/airbyte-example-source',
        'faros_airbyte_cli_src_config_jennie.json',
      ),
    ).rejects.toThrow('Failed to validate source connection: User is not chris.');
  });
});
