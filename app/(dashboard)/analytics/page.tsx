"use client";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradingStore } from '@/stores/tradingStore';
import { BarChart3, TrendingUp, PieChart } from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const AnalyticsPage = () => {
  const { trades, equityHistory } = useTradingStore();

  // Mock analytics data
  const winLossData = {
    wins: trades.filter(t => t.pnl > 0).length,
    losses: trades.filter(t => t.pnl < 0).length,
  };

  const monthlyPerformance = [
    { month: 'Jan', pnl: 2500 },
    { month: 'Feb', pnl: -1200 },
    { month: 'Mar', pnl: 3800 },
    // Add more mock data
  ];

  // Prepare data for pie chart
  const pieData = [
    { name: 'Wins', value: winLossData.wins, color: '#22c55e' },
    { name: 'Losses', value: winLossData.losses, color: '#ef4444' },
  ];

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent, index
  }: {
    cx: number;
    cy: number;
    midAngle: number;
    innerRadius: number;
    outerRadius: number;
    percent: number;
    index: number;
  }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground">Detailed performance analysis and insights</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{trades.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {trades.length > 0 ? ((winLossData.wins / trades.length) * 100).toFixed(1) : 0}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Best Trade</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{Math.max(...trades.map(t => t.pnl), 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Trade</CardTitle>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{(trades.reduce((acc, t) => acc + t.pnl, 0) / Math.max(trades.length, 1)).toFixed(0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Win/Loss Distribution Pie Chart */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Win/Loss Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={renderCustomizedLabel}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value} trades`, 'Count']}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    <span className="text-sm font-medium">Wins: {winLossData.wins}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded"></div>
                    <span className="text-sm font-medium">Losses: {winLossData.losses}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total P&L</span>
                    <span className={trades.reduce((acc, t) => acc + t.pnl, 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                      ₹{trades.reduce((acc, t) => acc + t.pnl, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Largest Win</span>
                    <span className="text-green-600">
                      ₹{Math.max(...trades.map(t => t.pnl), 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Largest Loss</span>
                    <span className="text-red-600">
                      ₹{Math.min(...trades.map(t => t.pnl), 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Profit Factor</span>
                    <span>
                      {(Math.abs(trades.filter(t => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0)) / 
                        Math.abs(trades.filter(t => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0)) || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Monthly Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(var(--foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--foreground))"
                      fontSize={12}
                      tickFormatter={(value) => `₹${value.toLocaleString()}`}
                    />
                    <Tooltip
                      formatter={(value: number) => [`₹${value.toLocaleString()}`, 'P&L']}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Bar
                      dataKey="pnl"
                      fill={(entry: { month: string; pnl: number }) => entry.pnl >= 0 ? '#22c55e' : '#ef4444'}
                      radius={[4, 4, 0, 0]}
                    >
                      {monthlyPerformance.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Trade Frequency</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Trades</span>
                    <span className="font-semibold">{trades.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Avg Trades/Month</span>
                    <span className="font-semibold">{(trades.length / 12).toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Most Active Month</span>
                    <span className="font-semibold">March</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance by Hour</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { hour: '9:00-10:00', pnl: 1250 },
                    { hour: '10:00-11:00', pnl: -450 },
                    { hour: '11:00-12:00', pnl: 890 },
                    { hour: '14:00-15:00', pnl: 2100 },
                  ].map((item) => (
                    <div key={item.hour} className="flex items-center justify-between">
                      <span className="text-sm">{item.hour}</span>
                      <span className={`text-sm font-medium ${item.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.pnl >= 0 ? '+' : ''}₹{item.pnl}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Risk Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Max Drawdown</span>
                    <span className="text-red-600 font-semibold">-12.5%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Sharpe Ratio</span>
                    <span className="font-semibold">1.23</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Calmar Ratio</span>
                    <span className="font-semibold">0.85</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Win Rate</span>
                    <span className="font-semibold">{trades.length > 0 ? ((winLossData.wins / trades.length) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Profit Factor</span>
                    <span className="font-semibold">
                      {(Math.abs(trades.filter(t => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0)) / 
                        Math.abs(trades.filter(t => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0)) || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Avg Win</span>
                    <span className="text-green-600 font-semibold">
                      ₹{winLossData.wins > 0 ? (trades.filter(t => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0) / winLossData.wins).toFixed(0) : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Avg Loss</span>
                    <span className="text-red-600 font-semibold">
                      ₹{winLossData.losses > 0 ? (Math.abs(trades.filter(t => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0)) / winLossData.losses).toFixed(0) : '0'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">Low Risk</span>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      Your Sharpe ratio indicates good risk-adjusted returns. Consider maintaining current position sizing.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Recommendations</h4>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• Keep position sizes under 5% of portfolio</li>
                      <li>• Consider adding stop-loss orders</li>
                      <li>• Diversify across different sectors</li>
                      <li>• Review losing trades for patterns</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Drawdown History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { month: 'Jan', drawdown: -2.1 },
                    { month: 'Feb', drawdown: -5.8 },
                    { month: 'Mar', drawdown: -12.5 },
                    { month: 'Apr', drawdown: -3.2 },
                    { month: 'May', drawdown: -1.5 },
                    { month: 'Jun', drawdown: -0.8 },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(var(--foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--foreground))"
                      fontSize={12}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, 'Drawdown']}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Bar dataKey="drawdown" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsPage;