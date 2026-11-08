export function cleanFillers(text) {
    // Keep standalone affirmations and vocabulary such as “然后” or “其实”.
    return text.replace(/(^|[\s，。！？、；：,.!?;:])(?:嗯+|呃+|额+|唔+)(?:[ \t]*[，,、][ \t]*|[ \t]+)(?=[^\s，。！？、；：,.!?;:])/gu, '$1')
        .replace(/(^|[\s,.!?;:])(?:uh+|um+|erm+)(?:[ \t]*,[ \t]*|[ \t]+)(?=[^\s,.!?;:])/giu, '$1')
        .trim();
}
