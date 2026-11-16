/*
 * Radix Colors, @radix-ui/colors 3.0.0 (https://github.com/radix-ui/colors), sRGB hex values copied from its
 * red/orange/yellow/green/cyan/blue/violet/pink CSS files (light and `-dark`), steps 1 to 12 (index 0 to 11).
 * Step roles: 1-2 backgrounds, 3-5 component fills, 6-8 borders, 9-10 solid fills, 11-12 text.
 *
 * MIT License
 *
 * Copyright (c) 2021 Radix
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type RadixScheme = 'light' | 'dark';
export type RadixHue = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'violet' | 'pink';
/** The steps the tiles use, emitted as `--rx-<hue>-<step>` by the semantic resolver. */
export const RADIX_STEPS_USED = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const RADIX_HUES: readonly RadixHue[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'violet',
  'pink',
];
export const RADIX: Record<RadixScheme, Record<RadixHue, readonly string[]>> = {
  light: {
    red: [
      '#fffcfc',
      '#fff7f7',
      '#feebec',
      '#ffdbdc',
      '#ffcdce',
      '#fdbdbe',
      '#f4a9aa',
      '#eb8e90',
      '#e5484d',
      '#dc3e42',
      '#ce2c31',
      '#641723',
    ],
    orange: [
      '#fefcfb',
      '#fff7ed',
      '#ffefd6',
      '#ffdfb5',
      '#ffd19a',
      '#ffc182',
      '#f5ae73',
      '#ec9455',
      '#f76b15',
      '#ef5f00',
      '#cc4e00',
      '#582d1d',
    ],
    yellow: [
      '#fdfdf9',
      '#fefce9',
      '#fffab8',
      '#fff394',
      '#ffe770',
      '#f3d768',
      '#e4c767',
      '#d5ae39',
      '#ffe629',
      '#ffdc00',
      '#9e6c00',
      '#473b1f',
    ],
    green: [
      '#fbfefc',
      '#f4fbf6',
      '#e6f6eb',
      '#d6f1df',
      '#c4e8d1',
      '#adddc0',
      '#8eceaa',
      '#5bb98b',
      '#30a46c',
      '#2b9a66',
      '#218358',
      '#193b2d',
    ],
    cyan: [
      '#fafdfe',
      '#f2fafb',
      '#def7f9',
      '#caf1f6',
      '#b5e9f0',
      '#9ddde7',
      '#7dcedc',
      '#3db9cf',
      '#00a2c7',
      '#0797b9',
      '#107d98',
      '#0d3c48',
    ],
    blue: [
      '#fbfdff',
      '#f4faff',
      '#e6f4fe',
      '#d5efff',
      '#c2e5ff',
      '#acd8fc',
      '#8ec8f6',
      '#5eb1ef',
      '#0090ff',
      '#0588f0',
      '#0d74ce',
      '#113264',
    ],
    violet: [
      '#fdfcfe',
      '#faf8ff',
      '#f4f0fe',
      '#ebe4ff',
      '#e1d9ff',
      '#d4cafe',
      '#c2b5f5',
      '#aa99ec',
      '#6e56cf',
      '#654dc4',
      '#6550b9',
      '#2f265f',
    ],
    pink: [
      '#fffcfe',
      '#fef7fb',
      '#fee9f5',
      '#fbdcef',
      '#f6cee7',
      '#efbfdd',
      '#e7acd0',
      '#dd93c2',
      '#d6409f',
      '#cf3897',
      '#c2298a',
      '#651249',
    ],
  },
  dark: {
    red: [
      '#191111',
      '#201314',
      '#3b1219',
      '#500f1c',
      '#611623',
      '#72232d',
      '#8c333a',
      '#b54548',
      '#e5484d',
      '#ec5d5e',
      '#ff9592',
      '#ffd1d9',
    ],
    orange: [
      '#17120e',
      '#1e160f',
      '#331e0b',
      '#462100',
      '#562800',
      '#66350c',
      '#7e451d',
      '#a35829',
      '#f76b15',
      '#ff801f',
      '#ffa057',
      '#ffe0c2',
    ],
    yellow: [
      '#14120b',
      '#1b180f',
      '#2d2305',
      '#362b00',
      '#433500',
      '#524202',
      '#665417',
      '#836a21',
      '#ffe629',
      '#ffff57',
      '#f5e147',
      '#f6eeb4',
    ],
    green: [
      '#0e1512',
      '#121b17',
      '#132d21',
      '#113b29',
      '#174933',
      '#20573e',
      '#28684a',
      '#2f7c57',
      '#30a46c',
      '#33b074',
      '#3dd68c',
      '#b1f1cb',
    ],
    cyan: [
      '#0b161a',
      '#101b20',
      '#082c36',
      '#003848',
      '#004558',
      '#045468',
      '#12677e',
      '#11809c',
      '#00a2c7',
      '#23afd0',
      '#4ccce6',
      '#b6ecf7',
    ],
    blue: [
      '#0d1520',
      '#111927',
      '#0d2847',
      '#003362',
      '#004074',
      '#104d87',
      '#205d9e',
      '#2870bd',
      '#0090ff',
      '#3b9eff',
      '#70b8ff',
      '#c2e6ff',
    ],
    violet: [
      '#14121f',
      '#1b1525',
      '#291f43',
      '#33255b',
      '#3c2e69',
      '#473876',
      '#56468b',
      '#6958ad',
      '#6e56cf',
      '#7d66d9',
      '#baa7ff',
      '#e2ddfe',
    ],
    pink: [
      '#191117',
      '#21121d',
      '#37172f',
      '#4b143d',
      '#591c47',
      '#692955',
      '#833869',
      '#a84885',
      '#d6409f',
      '#de51a8',
      '#ff8dcc',
      '#fdd1ea',
    ],
  },
};

/** Hex of a Radix step (1 to 12). */
export function radixHex(scheme: RadixScheme, hue: RadixHue, step: number): string {
  return RADIX[scheme][hue][step - 1];
}
