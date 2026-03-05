"use client";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useMarketStore } from '@/stores/trading/market.store';

interface OptionsChainProps {
  onStrikeSelect: (symbol: string) => void;
  instrumentType?: string;
}

export function OptionsChain({ onStrikeSelect, instrumentType = "NIFTY" }: OptionsChainProps) {
  const { optionChain } = useMarketStore();

  const data = optionChain?.strikes || [];
  const underlyingPrice = optionChain?.underlyingPrice || 0;

  // Calculate Dynamic ATM (Closest Strike)
  const atm = data.reduce((prev, curr) => {
    return Math.abs(curr.strike - underlyingPrice) < Math.abs(prev.strike - underlyingPrice) ? curr : prev;
  }, data[0] || { strike: 0 }).strike;

  const title = `${instrumentType} Options Chain`;

  const formatNumber = (value: number) => {
    return value.toLocaleString('en-IN');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  const handleStrikeClick = (symbol: string) => {
    onStrikeSelect(symbol);
  };

  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="outline" className="text-xs">
            ATM: {atm.toLocaleString()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card border-border z-10">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-center font-semibold text-call border-r" colSpan={3}>
                  CALL OPTIONS (CE)
                </TableHead>
                <TableHead className="text-center font-bold border-x min-w-[80px]">
                  STRIKE
                </TableHead>
                <TableHead className="text-center font-semibold text-put border-l" colSpan={3}>
                  PUT OPTIONS (PE)
                </TableHead>
              </TableRow>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-center text-xs font-medium text-muted-foreground">LTP</TableHead>
                <TableHead className="text-center text-xs font-medium text-muted-foreground">OI</TableHead>
                <TableHead className="text-center text-xs font-medium text-muted-foreground">VOL</TableHead>
                <TableHead className="text-center text-xs font-medium text-muted-foreground">PRICE</TableHead>
                <TableHead className="text-center text-xs font-medium text-muted-foreground">LTP</TableHead>
                <TableHead className="text-center text-xs font-medium text-muted-foreground">OI</TableHead>
                <TableHead className="text-center text-xs font-medium text-muted-foreground">VOL</TableHead>
              </TableRow>
            </TableHeader>


            <TableBody>
              {data.map((strikeData) => (
                <TableRow
                  key={strikeData.strike}
                  className={cn(
                    'hover:bg-muted/30 transition-colors border-border',
                    strikeData.strike === atm && 'bg-primary/5 border-primary/20 shadow-sm'
                  )}
                >
                  {/* CE Columns */}
                  <TableCell
                    className="text-center font-medium text-profit cursor-pointer hover:bg-muted/50 transition-colors p-2"
                    onClick={() => strikeData.ce && handleStrikeClick(strikeData.ce.symbol)}
                  >
                    {strikeData.ce ? formatCurrency(strikeData.ce.ltp) : '-'}
                  </TableCell>
                  <TableCell
                    className="text-center cursor-pointer hover:bg-muted/50 transition-colors p-2"
                    onClick={() => strikeData.ce && handleStrikeClick(strikeData.ce.symbol)}
                  >
                    {strikeData.ce ? formatNumber(strikeData.ce.oi) : '-'}
                  </TableCell>
                  <TableCell
                    className="text-center cursor-pointer hover:bg-muted/50 transition-colors p-2"
                    onClick={() => strikeData.ce && handleStrikeClick(strikeData.ce.symbol)}
                  >
                    {strikeData.ce ? formatNumber(strikeData.ce.volume) : '-'}
                  </TableCell>

                  {/* Strike */}
                  <TableCell className={cn(
                    "text-center font-bold p-2 border-x",
                    strikeData.strike === atm && "bg-primary/10 text-primary font-extrabold"
                  )}>
                    {strikeData.strike.toLocaleString()}
                    {strikeData.strike === atm && (
                      <div className="text-xs text-primary/70 mt-1">ATM</div>
                    )}
                  </TableCell>

                  {/* PE Columns */}
                  <TableCell
                    className="text-center font-medium text-loss cursor-pointer hover:bg-muted/50 transition-colors p-2"
                    onClick={() => strikeData.pe && handleStrikeClick(strikeData.pe.symbol)}
                  >
                    {strikeData.pe ? formatCurrency(strikeData.pe.ltp) : '-'}
                  </TableCell>
                  <TableCell
                    className="text-center cursor-pointer hover:bg-muted/50 transition-colors p-2"
                    onClick={() => strikeData.pe && handleStrikeClick(strikeData.pe.symbol)}
                  >
                    {strikeData.pe ? formatNumber(strikeData.pe.oi) : '-'}
                  </TableCell>
                  <TableCell
                    className="text-center cursor-pointer hover:bg-muted/50 transition-colors p-2"
                    onClick={() => strikeData.pe && handleStrikeClick(strikeData.pe.symbol)}
                  >
                    {strikeData.pe ? formatNumber(strikeData.pe.volume) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
