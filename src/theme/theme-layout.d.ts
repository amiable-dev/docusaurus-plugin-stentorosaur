declare module '@theme/Layout' {
  import type {ReactNode} from 'react';

  export interface Props {
    readonly children?: ReactNode;
    readonly title?: string;
    readonly description?: string;
  }

  export default function Layout(props: Props): JSX.Element;
}
