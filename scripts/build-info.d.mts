export interface BuildMetadata {commit:string;version:string;builtAt:string;environment:string}
export function buildMetadata(input?:Partial<BuildMetadata>):BuildMetadata;
