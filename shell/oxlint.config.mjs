import { defineConfig } from 'oxlint';
import { oxlint } from 'oxc-config-mantine';

export default defineConfig({
  ...oxlint,
  ignorePatterns: ['**/*.{mjs,cjs,js,d.ts,d.mts}', 'dist', 'storybook-static'],
  overrides: [
    ...(oxlint.overrides ?? []),
    {
      files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@mantine/core',
                importNames: [
                  'ActionIcon',
                  'Button',
                  'NumberInput',
                  'TextInput',
                  'Textarea',
                  'Select',
                  'NativeSelect',
                  'MultiSelect',
                  'SegmentedControl',
                  'Switch',
                  'Table',
                  'Checkbox',
                  'Radio',
                  'Chip',
                ],
                message: 'Import UI controls from src/ui/ instead of raw @mantine/core.',
              },
            ],
          },
        ],
      },
    },
  ],
});
