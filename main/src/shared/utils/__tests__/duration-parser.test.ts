import { describe, it, expect } from 'vitest';
import { DurationParser } from '../duration-parser';

describe('DurationParser', () => {
    describe('parse()', () => {
        it('should parse minutes correctly', () => {
            expect(DurationParser.parse('1m')).toBe(60);
            expect(DurationParser.parse('5m')).toBe(300);
            expect(DurationParser.parse('30m')).toBe(1800);
            expect(DurationParser.parse('60m')).toBe(3600);
        });

        it('should parse hours correctly', () => {
            expect(DurationParser.parse('1h')).toBe(3600);
            expect(DurationParser.parse('2h')).toBe(7200);
            expect(DurationParser.parse('12h')).toBe(43200);
            expect(DurationParser.parse('24h')).toBe(86400);
        });

        it('should parse days correctly', () => {
            expect(DurationParser.parse('1d')).toBe(86400);
            expect(DurationParser.parse('7d')).toBe(604800);
            expect(DurationParser.parse('30d')).toBe(2592000);
        });

        it('should handle case-insensitive input', () => {
            expect(DurationParser.parse('1M')).toBe(60);
            expect(DurationParser.parse('1H')).toBe(3600);
            expect(DurationParser.parse('1D')).toBe(86400);
        });

        it('should handle whitespace in input', () => {
            expect(DurationParser.parse(' 1m ')).toBe(60);
            expect(DurationParser.parse('  30m  ')).toBe(1800);
        });

        it('should throw error for invalid format', () => {
            expect(() => DurationParser.parse('abc')).toThrow('无效的时长格式');
            expect(() => DurationParser.parse('1')).toThrow('无效的时长格式');
            expect(() => DurationParser.parse('m')).toThrow('无效的时长格式');
            expect(() => DurationParser.parse('1x')).toThrow('无效的时长格式');
        });

        it('should throw error for negative values', () => {
            expect(() => DurationParser.parse('-1m')).toThrow('无效的时长格式');
            expect(() => DurationParser.parse('-5h')).toThrow('无效的时长格式');
        });

        it('should throw error for zero value', () => {
            expect(() => DurationParser.parse('0m')).toThrow('时长必须大于0');
        });

        it('should handle large numbers', () => {
            expect(DurationParser.parse('999m')).toBe(59940);
            expect(DurationParser.parse('100h')).toBe(360000);
            expect(DurationParser.parse('365d')).toBe(31536000);
        });
    });

    describe('format()', () => {
        it('should format seconds correctly', () => {
            expect(DurationParser.format(30)).toBe('30秒');
            expect(DurationParser.format(59)).toBe('59秒');
        });

        it('should format minutes correctly', () => {
            expect(DurationParser.format(60)).toBe('1分钟');
            expect(DurationParser.format(300)).toBe('5分钟');
            expect(DurationParser.format(1800)).toBe('30分钟');
        });

        it('should format hours correctly', () => {
            expect(DurationParser.format(3600)).toBe('1小时');
            expect(DurationParser.format(7200)).toBe('2小时');
            expect(DurationParser.format(43200)).toBe('12小时');
        });

        it('should format days correctly', () => {
            expect(DurationParser.format(86400)).toBe('1天');
            expect(DurationParser.format(604800)).toBe('7天');
            expect(DurationParser.format(2592000)).toBe('30天');
        });

        it('should format mixed units correctly', () => {
            expect(DurationParser.format(90)).toBe('1分钟30秒');
            expect(DurationParser.format(3661)).toBe('1小时1分钟1秒');
            expect(DurationParser.format(86461)).toBe('1天1分钟1秒');
            expect(DurationParser.format(90061)).toBe('1天1小时1分钟1秒');
        });

        it('should format complex durations', () => {
            expect(DurationParser.format(3723)).toBe('1小时2分钟3秒');
            expect(DurationParser.format(90125)).toBe('1天1小时2分钟5秒');
        });

        it('should handle zero seconds', () => {
            expect(DurationParser.format(0)).toBe('0秒');
        });

        it('should handle very large durations', () => {
            const oneYear = 365 * 24 * 60 * 60;
            expect(DurationParser.format(oneYear)).toBe('365天');
        });
    });

    describe('Constants', () => {
        it('should have correct default ban duration', () => {
            expect(DurationParser.DEFAULT_BAN_DURATION).toBe(1800); // 30 minutes
        });

        it('should have correct max ban duration', () => {
            expect(DurationParser.MAX_BAN_DURATION).toBe(2592000); // 30 days
        });
    });

    describe('Edge Cases', () => {
        it('should handle boundary values for parse', () => {
            expect(DurationParser.parse('1m')).toBe(60);
            expect(DurationParser.parse('1440m')).toBe(86400); // 1 day in minutes
        });

        it('should handle boundary values for format', () => {
            expect(DurationParser.format(1)).toBe('1秒');
            expect(DurationParser.format(59)).toBe('59秒');
            expect(DurationParser.format(60)).toBe('1分钟');
            expect(DurationParser.format(3599)).toBe('59分钟59秒');
            expect(DurationParser.format(3600)).toBe('1小时');
        });

        it('should handle default and max duration constants', () => {
            const formattedDefault = DurationParser.format(DurationParser.DEFAULT_BAN_DURATION);
            expect(formattedDefault).toBe('30分钟');

            const formattedMax = DurationParser.format(DurationParser.MAX_BAN_DURATION);
            expect(formattedMax).toBe('30天');
        });
    });
});
