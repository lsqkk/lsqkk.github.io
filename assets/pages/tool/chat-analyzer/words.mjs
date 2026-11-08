const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

export function* wordsIn(line) {
    const text = line.replace(/https?:\/\/\S+|\S+@\S+/gi, token => ' '.repeat(token.length));
    if (segmenter) {
        for (const { segment, index, isWordLike } of segmenter.segment(text)) {
            if (isWordLike && /[\p{L}\p{N}]/u.test(segment)) yield { word: segment.toLowerCase(), index, length: segment.length };
        }
    } else {
        for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
            yield { word: match[0].toLowerCase(), index: match.index, length: match[0].length };
        }
    }
}
