declare module "pdfmake/build/pdfmake.js" {
  const pdfMake: {
    addVirtualFileSystem(fonts: Record<string,string>): void;
    createPdf(definition: any): { download(filename: string): Promise<void>; getBuffer(): Promise<Uint8Array>; getBlob(): Promise<Blob> };
  };
  export default pdfMake;
}
declare module "pdfmake/build/vfs_fonts.js" {
  const fonts: Record<string,string>;
  export default fonts;
}
